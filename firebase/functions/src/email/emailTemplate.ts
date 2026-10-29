/**
 * Universal Brand Email Template System for DispatchBox
 * 
 * Generates modern, high-end, responsive HTML emails for quotes, invoices,
 * intake confirmations, and customer communications across all onboarded companies.
 * 
 * Features:
 * - Bulletproof Outlook VML buttons and responsive tables
 * - Intelligent Brand Monogram fallback (eliminates broken image boxes if no logo or blocked)
 * - Light and Dark mode color safety
 * - Standardized modern typography, status pill badges, and timeline steps
 */

export interface EmailLayoutOptions {
    companyName: string;
    primaryColor?: string;
    logoUrl?: string | null;
    badgeText?: string;
    badgeVariant?: 'success' | 'info' | 'warning' | 'purple' | 'neutral';
    preheaderText?: string;
    bodyHtml: string;
    footerPhone?: string;
    footerEmail?: string;
    footerAddress?: string;
    footerWebsite?: string;
}

/**
 * Validates whether a URL is a secure HTTPS link that can be safely loaded as an image.
 */
export function isValidHttpsUrl(url?: string | null): boolean {
    if (!url || typeof url !== 'string') return false;
    const trimmed = url.trim();
    if (trimmed.toLowerCase() === 'null' || trimmed.toLowerCase() === 'undefined') return false;
    return /^https:\/\/[a-zA-Z0-9\-._~:/?#[\]@!$&'()*+,;=]+$/i.test(trimmed);
}

/**
 * Extracts 1-2 uppercase monogram letters from a company name (e.g. "Island Flow Plumbing" -> "IF").
 */
export function getCompanyMonogram(name: string): string {
    if (!name) return 'DB';
    const words = name.trim().split(/\s+/).filter(w => w.length > 0);
    if (words.length === 1) {
        return words[0].substring(0, 2).toUpperCase();
    }
    return (words[0][0] + words[1][0]).toUpperCase();
}

/**
 * Renders either a verified HTTPS logo image or a crisp, modern brand monogram badge.
 * This GUARANTEES that no customer ever sees an ugly broken image box [x].
 */
export function renderBrandHeaderGraphic(companyName: string, primaryColor: string = '#2563eb', logoUrl?: string | null): string {
    if (isValidHttpsUrl(logoUrl)) {
        return `
        <table cellpadding="0" cellspacing="0" border="0" style="margin: 0 auto 14px;">
            <tr>
                <td align="center" valign="middle">
                    <img src="${logoUrl}" alt="${companyName}" border="0" style="display: block; max-height: 48px; max-width: 220px; width: auto; height: auto; outline: none; text-decoration: none; margin: 0 auto;" />
                </td>
            </tr>
        </table>`;
    }

    const monogram = getCompanyMonogram(companyName);
    return `
    <table cellpadding="0" cellspacing="0" border="0" style="margin: 0 auto 14px;">
        <tr>
            <td align="center" valign="middle" style="width: 46px; height: 46px; background: ${primaryColor}; border-radius: 12px; color: #ffffff; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 17px; font-weight: 800; letter-spacing: 0.5px; text-align: center; box-shadow: 0 4px 10px rgba(0, 0, 0, 0.12);">
                ${monogram}
            </td>
        </tr>
    </table>`;
}

/**
 * Renders a modern pill badge for statuses (e.g. Request Received, Quote Ready, Invoice Due).
 */
export function renderPillBadge(
    text: string,
    variant: 'success' | 'info' | 'warning' | 'purple' | 'neutral' = 'info'
): string {
    const styles: Record<string, { bg: string; border: string; color: string }> = {
        success: { bg: '#ecfdf5', border: '#a7f3d0', color: '#047857' },
        info: { bg: '#eff6ff', border: '#bfdbfe', color: '#1d4ed8' },
        warning: { bg: '#fef3c7', border: '#fde68a', color: '#b45309' },
        purple: { bg: '#f5f3ff', border: '#ddd6fe', color: '#6d28d9' },
        neutral: { bg: '#f1f5f9', border: '#cbd5e1', color: '#334155' }
    };
    const s = styles[variant] || styles.info;

    return `
    <table cellpadding="0" cellspacing="0" border="0" style="margin: 10px auto 0;">
        <tr>
            <td style="background-color: ${s.bg}; border: 1px solid ${s.border}; border-radius: 9999px; padding: 4px 14px; color: ${s.color}; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 12px; font-weight: 600; letter-spacing: 0.3px; text-align: center;">
                ${text}
            </td>
        </tr>
    </table>`;
}

/**
 * Renders an Outlook-bulletproof CTA button with VML support.
 */
export function renderEmailButton(url: string, label: string, primaryColor: string = '#2563eb'): string {
    return `
    <table cellpadding="0" cellspacing="0" border="0" style="margin: 20px auto 10px;">
        <tr>
            <td align="center">
                <!--[if mso]>
                <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${url}" style="height:46px;v-text-anchor:middle;width:240px;" arcsize="18%" stroke="f" fillcolor="${primaryColor}">
                    <w:anchorlock/>
                    <center style="color:#ffffff;font-family:sans-serif;font-size:15px;font-weight:bold;">${label}</center>
                </v:roundrect>
                <![endif]-->
                <a href="${url}" target="_blank" style="mso-hide:all;display:inline-block;background-color:${primaryColor};color:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:15px;font-weight:600;line-height:46px;height:46px;padding:0 34px;text-align:center;text-decoration:none;border-radius:8px;box-shadow:0 2px 6px rgba(0,0,0,0.12);letter-spacing:0.2px;">
                    ${label}
                </a>
            </td>
        </tr>
    </table>`;
}

/**
 * Renders a secure, modern customer tracking code access card.
 */
export function renderTrackingCodeBlock(
    trackingCode: string,
    trackingUrl?: string,
    primaryColor: string = '#2563eb'
): string {
    return `
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; margin: 24px 0; padding: 22px 20px; text-align: center;">
        <tr>
            <td align="center">
                <p style="color: #64748b; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 11px; font-weight: 700; margin: 0 0 10px; text-transform: uppercase; letter-spacing: 0.8px;">
                    Customer Access Key
                </p>
                <table cellpadding="0" cellspacing="0" border="0" style="margin: 0 auto 12px;">
                    <tr>
                        <td style="background-color: #ffffff; border: 1px solid #cbd5e1; border-radius: 8px; padding: 8px 22px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 20px; font-weight: 700; color: #0f172a; letter-spacing: 3px; text-align: center;">
                            ${trackingCode}
                        </td>
                    </tr>
                </table>
                <p style="color: #64748b; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 13px; line-height: 1.5; margin: 0 0 16px; max-width: 420px;">
                    Use this key anytime to track your request, view estimates, or communicate with our team — no account password required.
                </p>
                ${trackingUrl ? renderEmailButton(trackingUrl, 'Track Your Request &rarr;', primaryColor) : ''}
            </td>
        </tr>
    </table>`;
}

/**
 * Renders a modern 3-step vertical progress timeline (replaces outdated, harsh green ordered lists).
 */
export function renderStepTimeline(steps: { title: string; description: string }[]): string {
    const stepsHtml = steps.map((step, index) => `
        <tr>
            <td valign="top" style="width: 32px; padding-bottom: ${index === steps.length - 1 ? '0' : '16px'};">
                <table cellpadding="0" cellspacing="0" border="0">
                    <tr>
                        <td align="center" valign="middle" style="width: 24px; height: 24px; background-color: #e2e8f0; border-radius: 50%; color: #334155; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 12px; font-weight: 700; text-align: center;">
                            ${index + 1}
                        </td>
                    </tr>
                </table>
            </td>
            <td valign="top" style="padding-left: 10px; padding-bottom: ${index === steps.length - 1 ? '0' : '16px'};">
                <p style="color: #1e293b; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 14px; font-weight: 600; margin: 0 0 2px;">
                    ${step.title}
                </p>
                <p style="color: #64748b; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 13px; line-height: 1.4; margin: 0;">
                    ${step.description}
                </p>
            </td>
        </tr>
    `).join('');

    return `
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; margin: 24px 0;">
        <tr>
            <td colspan="2" style="padding-bottom: 14px;">
                <p style="color: #334155; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 12px; font-weight: 700; margin: 0; text-transform: uppercase; letter-spacing: 0.6px;">
                    What Happens Next
                </p>
            </td>
        </tr>
        ${stepsHtml}
    </table>`;
}

/**
 * Wraps body content in a cohesive, world-class HTML email frame.
 */
export function renderEmailLayout(opts: EmailLayoutOptions): string {
    const {
        companyName,
        primaryColor = '#2563eb',
        logoUrl,
        badgeText,
        badgeVariant = 'info',
        preheaderText = '',
        bodyHtml,
        footerPhone,
        footerEmail,
        footerAddress,
        footerWebsite
    } = opts;

    const brandGraphic = renderBrandHeaderGraphic(companyName, primaryColor, logoUrl);
    const badgeHtml = badgeText ? renderPillBadge(badgeText, badgeVariant) : '';

    const currentYear = new Date().getFullYear();

    const footerContactItems: string[] = [];
    if (footerPhone) footerContactItems.push(footerPhone);
    if (footerEmail) footerContactItems.push(footerEmail);
    if (footerWebsite) footerContactItems.push(footerWebsite.replace(/^https?:\/\//, ''));

    const contactLine = footerContactItems.length > 0
        ? `<p style="color: #64748b; font-size: 12px; line-height: 1.5; margin: 0 0 6px;">${footerContactItems.join(' • ')}</p>`
        : '';

    const addressLine = footerAddress
        ? `<p style="color: #94a3b8; font-size: 11px; margin: 0 0 10px;">${footerAddress}</p>`
        : '';

    return `<!DOCTYPE html>
<html lang="en" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="color-scheme" content="light dark">
    <meta name="supported-color-schemes" content="light dark">
    <title>${companyName}</title>
    <!--[if mso]>
    <noscript>
        <xml>
            <o:OfficeDocumentSettings>
                <o:PixelsPerInch>96</o:PixelsPerInch>
            </o:OfficeDocumentSettings>
        </xml>
    </noscript>
    <![endif]-->
    <style>
        :root {
            color-scheme: light dark;
            supported-color-schemes: light dark;
        }
        body {
            margin: 0;
            padding: 0;
            -webkit-text-size-adjust: 100%;
            -ms-text-size-adjust: 100%;
        }
        table, td {
            mso-table-lspace: 0pt;
            mso-table-rspace: 0pt;
        }
        img {
            -ms-interpolation-mode: bicubic;
            border: 0;
            height: auto;
            line-height: 100%;
            outline: none;
            text-decoration: none;
        }
        @media only screen and (max-width: 620px) {
            .email-container {
                width: 100% !important;
                border-radius: 0 !important;
            }
            .content-padding {
                padding: 24px 20px !important;
            }
            .header-padding {
                padding: 28px 20px 18px !important;
            }
        }
    </style>
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
    ${preheaderText ? `<div style="display:none;font-size:1px;color:#f1f5f9;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">${preheaderText}</div>` : ''}
    
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f1f5f9; padding: 36px 12px;">
        <tr>
            <td align="center" valign="top">
                <table class="email-container" width="600" cellpadding="0" cellspacing="0" border="0" style="width: 100%; max-width: 600px; background-color: #ffffff; border-radius: 14px; overflow: hidden; box-shadow: 0 4px 18px rgba(0, 0, 0, 0.05); border: 1px solid #e2e8f0;">
                    <!-- Brand Top Accent Bar -->
                    <tr>
                        <td style="height: 5px; background: linear-gradient(90deg, ${primaryColor}, #38bdf8); font-size: 1px; line-height: 1px;">&nbsp;</td>
                    </tr>

                    <!-- Elegant Brand Header -->
                    <tr>
                        <td class="header-padding" align="center" style="padding: 32px 36px 20px; text-align: center; border-bottom: 1px solid #f1f5f9;">
                            ${brandGraphic}
                            <h1 style="color: #0f172a; margin: 0; font-size: 20px; font-weight: 700; letter-spacing: -0.3px;">
                                ${companyName}
                            </h1>
                            ${badgeHtml}
                        </td>
                    </tr>

                    <!-- Email Body -->
                    <tr>
                        <td class="content-padding" style="padding: 32px 36px;">
                            ${bodyHtml}
                        </td>
                    </tr>

                    <!-- Clean Minimalist Footer -->
                    <tr>
                        <td style="background-color: #f8fafc; padding: 24px 36px; border-top: 1px solid #e2e8f0; text-align: center;">
                            <p style="color: #0f172a; font-size: 13px; font-weight: 600; margin: 0 0 6px;">
                                ${companyName}
                            </p>
                            ${contactLine}
                            ${addressLine}
                            <p style="color: #94a3b8; font-size: 11px; margin: 10px 0 0;">
                                &copy; ${currentYear} ${companyName}. All rights reserved.<br>
                                Communication managed via DispatchBox Service Management.
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>`;
}
