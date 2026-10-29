/**
 * BillingTypePicker — "How will you charge for this job?"
 *
 * Shown in the quote editor. If the business picked ONE billing style in
 * Workflow Setup, this shows a one-line note instead of a choice. If they
 * picked "Let me choose on each job", the user taps Fixed price or
 * Time & materials. T&M shows the few terms the customer agrees to.
 */
import React from 'react';
import { FileText, Clock } from 'lucide-react';
import type { BillingType, BillingMode, TimeAndMaterialsTerms } from '../../types';

interface Props {
    orgBillingMode: BillingMode;
    value: BillingType;
    onChange: (v: BillingType) => void;
    terms: TimeAndMaterialsTerms;
    onTermsChange: (t: TimeAndMaterialsTerms) => void;
}

const num = (v: string) => (v === '' ? undefined : Math.max(0, Number(v) || 0));

export const BillingTypePicker: React.FC<Props> = ({ orgBillingMode, value, onChange, terms, onTermsChange }) => {
    const canChoose = orgBillingMode === 'per_job';
    const set = (patch: Partial<TimeAndMaterialsTerms>) => onTermsChange({ ...terms, ...patch });

    const option = (key: BillingType, Icon: typeof FileText, title: string, sub: string) => {
        const active = value === key;
        return (
            <button
                type="button"
                id={`billing-type-${key}`}
                onClick={() => onChange(key)}
                className={`flex-1 text-left rounded-xl border-2 p-3 transition-all cursor-pointer ${active
                    ? 'border-blue-600 bg-blue-50 shadow-sm'
                    : 'border-gray-200 bg-white hover:border-blue-300'}`}
            >
                <div className="flex items-center gap-2">
                    <Icon className={`w-4 h-4 ${active ? 'text-blue-600' : 'text-gray-500'}`} />
                    <span className="text-sm font-semibold text-gray-900">{title}</span>
                </div>
                <p className="text-xs text-gray-500 mt-1">{sub}</p>
            </button>
        );
    };

    return (
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4" id="billing-type-section">
            <h2 className="text-sm font-semibold text-gray-900 mb-2">How will you charge for this job?</h2>

            {canChoose ? (
                <div className="flex flex-col sm:flex-row gap-2">
                    {option('fixed', FileText, 'Fixed price', 'Customer approves one price. The invoice matches the quote.')}
                    {option('time_and_materials', Clock, 'Time & materials', 'Customer approves your rates. The invoice uses actual time + materials.')}
                </div>
            ) : (
                <p className="text-xs text-gray-600">
                    {value === 'fixed' ? 'Fixed price' : 'Time & materials'} — set for your business in Settings → Workflow Setup.
                </p>
            )}

            {value === 'time_and_materials' && (
                <div className="mt-3 grid grid-cols-2 md:grid-cols-6 gap-2" id="tm-terms">
                    <label className="text-xs text-gray-600">
                        Labor rate ($/hr)
                        <input id="tm-labor-rate" type="number" min={0} value={terms.laborRate ?? ''}
                            onChange={e => set({ laborRate: num(e.target.value) ?? 0 })}
                            className="mt-1 w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm" />
                    </label>
                    <label className="text-xs text-gray-600">
                        Materials markup (%)
                        <input id="tm-markup" type="number" min={0} value={terms.materialMarkup ?? ''}
                            onChange={e => set({ materialMarkup: num(e.target.value) ?? 0 })}
                            className="mt-1 w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm" />
                    </label>
                    <label className="text-xs text-gray-600">
                        Trip fee ($)
                        <input id="tm-trip-fee" type="number" min={0} value={terms.tripFee ?? ''}
                            onChange={e => set({ tripFee: num(e.target.value) })}
                            className="mt-1 w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm" />
                    </label>
                    <label className="text-xs text-gray-600">
                        Estimate low ($)
                        <input id="tm-estimate-low" type="number" min={0} value={terms.estimateLow ?? ''}
                            onChange={e => set({ estimateLow: num(e.target.value) })}
                            className="mt-1 w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm" />
                    </label>
                    <label className="text-xs text-gray-600">
                        Estimate high ($)
                        <input id="tm-estimate-high" type="number" min={0} value={terms.estimateHigh ?? ''}
                            onChange={e => set({ estimateHigh: num(e.target.value) })}
                            className="mt-1 w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm" />
                    </label>
                    <label className="text-xs text-gray-600">
                        Not to exceed ($, optional)
                        <input id="tm-not-to-exceed" type="number" min={0} value={terms.notToExceed ?? ''}
                            onChange={e => set({ notToExceed: num(e.target.value) })}
                            className="mt-1 w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm" />
                    </label>
                    <p className="col-span-2 md:col-span-6 text-[11px] text-gray-500">
                        Line items below are your estimate. The final invoice is built from time on site and materials used.
                    </p>
                </div>
            )}
        </div>
    );
};
