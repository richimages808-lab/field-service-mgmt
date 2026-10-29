/**
 * depositEvaluator.ts
 *
 * Shared utility that evaluates whether a deposit is required for a given
 * job/quote based on the organization's Upfront Payment Policy.
 *
 * Used by both the outbound callback handler (outboundCall.ts) and the
 * inbound voice scheduling handler (voice.ts) to determine if the AI
 * should mention a deposit requirement and send a payment link.
 */
import * as admin from "firebase-admin";
import { renderEmailLayout, renderEmailButton } from "./email/emailTemplate";
import { sendEmailWithLog } from "./email/quoteNotifications";

const db = admin.firestore();

// ─── Types ───────────────────────────────────────────────────────────────────

export interface DepositEvaluation {
    required: boolean;
    amount: number;
    reason: string;      // Human-readable: "New customer deposit (50%)"
    rule: string;        // Which rule triggered: 'always', 'new_customers_only', etc.
    depositPercent: number;
    disclaimerText: string;
}

interface PaymentPolicy {
    enabled: boolean;
    defaultRule: string;
    defaultRules?: string[];
    overThreshold: number;
    paidEstimateAmount: number;
    depositPercent: number;
    customDepositAmount?: number;
    disclaimerText: string;
}

// ─── Main Evaluator ──────────────────────────────────────────────────────────

/**
 * Evaluate whether a deposit is required for a given quote, based on the
 * org's upfront payment policy. Returns the deposit amount and the rule
 * that triggered it.
 *
 * If multiple rules match (org allows stacking), the rule yielding the
 * HIGHEST deposit amount wins.
 */
export async function evaluateDepositRequirement(
    orgId: string,
    quoteId: string,
    customerId?: string
): Promise<DepositEvaluation> {
    const noDeposit: DepositEvaluation = {
        required: false,
        amount: 0,
        reason: "",
        rule: "none",
        depositPercent: 0,
        disclaimerText: ""
    };

    // 1. Load org's payment policy
    const orgDoc = await db.collection("organizations").doc(orgId).get();
    if (!orgDoc.exists) return noDeposit;

    const orgData = orgDoc.data()!;
    const policy: PaymentPolicy | undefined = orgData.settings?.upfrontPaymentPolicy;

    if (!policy || !policy.enabled) return noDeposit;

    // 2. Load quote for total and line items
    const quoteDoc = await db.collection("quotes").doc(quoteId).get();
    if (!quoteDoc.exists) return noDeposit;

    const quote = quoteDoc.data()!;
    const quoteTotal = quote.total || 0;

    // If the quote already has deposit marked as paid, no need
    if (quote.agreement?.depositPaid) return noDeposit;

    // 3. Determine active rules
    const activeRules: string[] = policy.defaultRules || (policy.defaultRule && policy.defaultRule !== "none" ? [policy.defaultRule] : []);

    if (activeRules.length === 0) return noDeposit;

    const depositPercent = policy.depositPercent || 50;
    const disclaimer = policy.disclaimerText || "Deposit is non-refundable within 24 hours of appointment. Applied to final invoice.";

    // 4. Evaluate each rule — collect all matching evaluations
    const candidates: DepositEvaluation[] = [];

    for (const rule of activeRules) {
        switch (rule) {
            case "always": {
                const amount = policy.customDepositAmount || Math.round(quoteTotal * (depositPercent / 100) * 100) / 100;
                candidates.push({
                    required: true,
                    amount,
                    reason: `Deposit required (${depositPercent}% of $${quoteTotal.toFixed(2)})`,
                    rule: "always",
                    depositPercent,
                    disclaimerText: disclaimer
                });
                break;
            }

            case "new_customers_only": {
                // Check if this customer has previous completed jobs
                const isNew = await isNewCustomer(orgId, customerId, quote.customer?.email, quote.customer?.phone);
                if (isNew) {
                    const amount = policy.customDepositAmount || Math.round(quoteTotal * (depositPercent / 100) * 100) / 100;
                    candidates.push({
                        required: true,
                        amount,
                        reason: `New customer deposit (${depositPercent}% of $${quoteTotal.toFixed(2)})`,
                        rule: "new_customers_only",
                        depositPercent,
                        disclaimerText: disclaimer
                    });
                }
                break;
            }

            case "over_threshold": {
                const threshold = policy.overThreshold || 500;
                if (quoteTotal > threshold) {
                    const amount = policy.customDepositAmount || Math.round(quoteTotal * (depositPercent / 100) * 100) / 100;
                    candidates.push({
                        required: true,
                        amount,
                        reason: `Quote over $${threshold} threshold — ${depositPercent}% deposit required`,
                        rule: "over_threshold",
                        depositPercent,
                        disclaimerText: disclaimer
                    });
                }
                break;
            }

            case "materials_only": {
                // Sum up material/parts line items
                const lineItems = quote.lineItems || [];
                const materialsCost = lineItems
                    .filter((item: any) => item.type === "material" || item.type === "part" || item.category === "materials")
                    .reduce((sum: number, item: any) => sum + ((item.unitPrice || 0) * (item.quantity || 1)), 0);

                if (materialsCost > 0) {
                    candidates.push({
                        required: true,
                        amount: Math.round(materialsCost * 100) / 100,
                        reason: `100% of materials/parts cost ($${materialsCost.toFixed(2)})`,
                        rule: "materials_only",
                        depositPercent: 100,
                        disclaimerText: disclaimer
                    });
                }
                break;
            }

            case "paid_estimate": {
                const fee = policy.paidEstimateAmount || 75;
                candidates.push({
                    required: true,
                    amount: fee,
                    reason: `Paid estimate fee ($${fee.toFixed(2)})`,
                    rule: "paid_estimate",
                    depositPercent: 0,
                    disclaimerText: disclaimer
                });
                break;
            }
        }
    }

    // 5. If no rules matched, no deposit
    if (candidates.length === 0) return noDeposit;

    // 6. Pick the rule yielding the highest deposit
    candidates.sort((a, b) => b.amount - a.amount);
    return candidates[0];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Determine if a customer is "new" to this org by checking for previous
 * completed jobs. Uses customerId, email, or phone to match.
 */
async function isNewCustomer(
    orgId: string,
    customerId?: string,
    email?: string,
    phone?: string
): Promise<boolean> {
    try {
        // Check by customer ID first (most reliable)
        if (customerId) {
            const jobsSnap = await db.collection("jobs")
                .where("org_id", "==", orgId)
                .where("customer_id", "==", customerId)
                .where("status", "==", "completed")
                .limit(1)
                .get();
            if (!jobsSnap.empty) return false;
        }

        // Fall back to email match
        if (email) {
            const jobsSnap = await db.collection("jobs")
                .where("org_id", "==", orgId)
                .where("customer.email", "==", email)
                .where("status", "==", "completed")
                .limit(1)
                .get();
            if (!jobsSnap.empty) return false;
        }

        // Fall back to phone match
        if (phone) {
            const normalized = phone.replace(/\D/g, "").slice(-10);
            const jobsSnap = await db.collection("jobs")
                .where("org_id", "==", orgId)
                .where("customer.phone", "==", phone)
                .limit(1)
                .get();
            if (!jobsSnap.empty) return false;

            // Try with +1 prefix
            if (normalized.length === 10) {
                const jobsSnap2 = await db.collection("jobs")
                    .where("org_id", "==", orgId)
                    .where("customer.phone", "==", `+1${normalized}`)
                    .limit(1)
                    .get();
                if (!jobsSnap2.empty) return false;
            }
        }

        // No completed jobs found — customer is new
        return true;
    } catch (err) {
        console.warn("[DepositEvaluator] Error checking customer history:", err);
        // Default to "new" (safer — require deposit when unsure)
        return true;
    }
}

// ─── Stripe Payment Link Sender ──────────────────────────────────────────────

/**
 * Create a Stripe Checkout session for the deposit and send the payment
 * link via SMS and email to the customer.
 *
 * This reuses the same Stripe configuration as createDepositCheckout in
 * stripe.ts but is callable from backend functions without going through
 * the onCall wrapper.
 */
export async function sendDepositPaymentLink(params: {
    orgId: string;
    jobId: string;
    quoteId: string;
    customerPhone?: string;
    customerEmail?: string;
    customerName?: string;
    depositAmount: number;
    depositReason: string;
}): Promise<{ success: boolean; checkoutUrl?: string; error?: string }> {
    const { orgId, jobId, quoteId, customerPhone, customerEmail, customerName, depositAmount, depositReason } = params;

    try {
        const Stripe = require("stripe");
        const functions = require("firebase-functions");
        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || functions.config().stripe?.secret_key || "sk_test_fake", {
            apiVersion: "2023-10-16",
        });

        const APP_URL = process.env.APP_URL || "https://dispatch-box.com";

        // Load org for branding
        const orgDoc = await db.collection("organizations").doc(orgId).get();
        const orgData = orgDoc.exists ? orgDoc.data()! : {} as any;
        const companyName = orgData.branding?.companyName || orgData.name || "Service Provider";
        const primaryColor = orgData.branding?.primaryColor || "#2563eb";
        const logoUrl = orgData.branding?.logoUrl || "";
        const phone = orgData.branding?.phone || orgData.phone || "";
        const address = orgData.branding?.address || orgData.address || "";
        const website = orgData.branding?.socialLinks?.website || orgData.website || "";

        // Load quote for scope of work
        const quoteDoc = await db.collection("quotes").doc(quoteId).get();
        const quoteData = quoteDoc.exists ? quoteDoc.data()! : {} as any;
        const quoteNumber = quoteData.quoteNumber || quoteId.slice(0, 8).toUpperCase();

        // Create Stripe Checkout Session
        const session = await stripe.checkout.sessions.create({
            mode: "payment",
            payment_method_types: ["card"],
            line_items: [
                {
                    price_data: {
                        currency: "usd",
                        product_data: {
                            name: `Deposit for Quote #${quoteNumber} — ${companyName}`,
                            description: quoteData.scopeOfWork || depositReason || "Service deposit",
                        },
                        unit_amount: Math.round(depositAmount * 100),
                    },
                    quantity: 1,
                },
            ],
            metadata: {
                quoteId,
                jobId,
                orgId,
                type: "deposit",
            },
            success_url: `${APP_URL}/pay/${quoteId}?status=success&session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${APP_URL}/pay/${quoteId}?status=cancelled`,
            customer_email: customerEmail || undefined,
        });

        const checkoutUrl = session.url;

        // Save checkout URL to quote and job
        await db.collection("quotes").doc(quoteId).update({
            "agreement.depositCheckoutSessionId": session.id,
            "agreement.depositPaymentUrl": checkoutUrl,
            "agreement.requiresDeposit": true,
            "agreement.depositAmount": depositAmount,
        });

        if (jobId) {
            await db.collection("jobs").doc(jobId).update({
                deposit_required: true,
                deposit_amount: depositAmount,
                deposit_checkout_url: checkoutUrl,
            });
        }

        // Send payment link via SMS
        if (customerPhone) {
            try {
                const { sendSMS } = require("./twilio/sms");
                const subDoc = await db.collection("org_texting_subscriptions").doc(orgId).get();
                const fromNumber = subDoc.exists ? subDoc.data()?.phoneNumber : undefined;

                await sendSMS(
                    customerPhone,
                    `💳 ${companyName}: To finalize your appointment, please pay your $${depositAmount.toFixed(2)} deposit here: ${checkoutUrl}\n\nIf you don't see this link, check your spam folder. Questions? Reply to this text. Reply STOP to opt out.`,
                    orgId,
                    fromNumber
                );
            } catch (smsErr) {
                console.warn("[DepositPaymentLink] SMS send failed:", (smsErr as Error).message);
            }
        }

        // Send payment link via email
        if (customerEmail) {
            try {
                const name = customerName || "there";
                const subject = `💳 Deposit Required — ${companyName}`;
                const bodyHtml = `
                <p style="color: #0f172a; font-size: 18px; font-weight: 700; margin: 0 0 12px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
                    Hi ${name},
                </p>
                <p style="color: #475569; font-size: 15px; line-height: 1.6; margin: 0 0 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
                    Thank you for scheduling your appointment with <strong>${companyName}</strong>! To finalize your booking and secure your appointment window, a deposit is required.
                </p>

                <!-- Deposit Hero Card -->
                <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; margin: 0 0 24px; padding: 24px 20px; text-align: center;">
                    <tr>
                        <td align="center">
                            <p style="color: #64748b; font-size: 11px; font-weight: 700; margin: 0 0 6px; text-transform: uppercase; letter-spacing: 0.8px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
                                Deposit Amount Required
                            </p>
                            <p style="color: #0f172a; font-size: 36px; font-weight: 800; margin: 0 0 8px; letter-spacing: -0.5px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
                                $${depositAmount.toFixed(2)}
                            </p>
                            <p style="color: #64748b; font-size: 13px; margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
                                ${depositReason} • Quote #${quoteNumber}
                            </p>
                        </td>
                    </tr>
                </table>

                ${renderEmailButton(checkoutUrl, `Pay $${depositAmount.toFixed(2)} Deposit &rarr;`, primaryColor)}

                <p style="color: #94a3b8; font-size: 13px; text-align: center; margin: 20px 0 0; line-height: 1.5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
                    This deposit will be automatically credited toward your final invoice upon job completion.
                </p>`;

                const html = renderEmailLayout({
                    companyName,
                    primaryColor,
                    logoUrl,
                    badgeText: 'Deposit Required 💳',
                    badgeVariant: 'warning',
                    preheaderText: `A deposit of $${depositAmount.toFixed(2)} is required to finalize your appointment with ${companyName}`,
                    bodyHtml,
                    footerPhone: phone,
                    footerEmail: orgData.outboundEmail?.fromEmail,
                    footerAddress: address,
                    footerWebsite: website
                });

                const text = `Hi ${name},\n\nTo finalize your appointment with ${companyName}, please pay your $${depositAmount.toFixed(2)} deposit:\n\n${checkoutUrl}\n\nThis deposit will be deducted from your final invoice.\n\n- ${companyName}`;

                await sendEmailWithLog(customerEmail, subject, html, text, undefined, undefined, { orgId, emailType: "deposit_payment_link" });
            } catch (emailErr) {
                console.warn("[DepositPaymentLink] Email send failed:", (emailErr as Error).message);
            }
        }

        console.log(`[DepositPaymentLink] Payment link sent for quote ${quoteId}: ${checkoutUrl}`);
        return { success: true, checkoutUrl };

    } catch (error) {
        console.error("[DepositPaymentLink] Error creating checkout session:", error);
        return { success: false, error: (error as Error).message };
    }
}
