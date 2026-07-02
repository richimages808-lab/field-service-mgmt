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
        const companyName = orgData.name || "Service Provider";

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
                const { sendEmailWithLog } = require("./emailService");
                const name = customerName || "there";
                const subject = `💳 Deposit Required — ${companyName}`;
                const html = `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e5e7eb; border-radius: 8px;">
                        <h2 style="color: #4F46E5;">Deposit Required to Finalize Your Appointment</h2>
                        <p>Hi ${name},</p>
                        <p>Thank you for scheduling your appointment with <strong>${companyName}</strong>! To finalize your booking, a deposit of <strong>$${depositAmount.toFixed(2)}</strong> is required.</p>
                        <p style="color: #6B7280; font-size: 14px;">${depositReason}</p>
                        <div style="margin: 25px 0;">
                            <a href="${checkoutUrl}" style="background-color: #4F46E5; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block; font-size: 16px;">
                                Pay $${depositAmount.toFixed(2)} Deposit
                            </a>
                        </div>
                        <p style="color: #9CA3AF; font-size: 13px;">This deposit will be deducted from your final invoice. If you have questions, reply to this email or contact us directly.</p>
                        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;" />
                        <p style="color: #9CA3AF; font-size: 12px;">Quote #${quoteNumber} • ${companyName}</p>
                    </div>
                `;
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
