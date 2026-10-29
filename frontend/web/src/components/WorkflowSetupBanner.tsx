/**
 * WorkflowSetupBanner — nudges owners/dispatchers (and solo techs) to answer
 * the Workflow Setup questions once. Hidden after they save or dismiss.
 */
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Workflow, X } from 'lucide-react';
import { useOrgWorkflow, WORKFLOW_LABELS } from '../lib/workflowSettings';
import { useOrgPath } from '../lib/orgRouting';

const DISMISS_KEY = 'workflow_setup_banner_dismissed';

export const WorkflowSetupBanner: React.FC = () => {
    const { workflow, loading } = useOrgWorkflow();
    const { orgPath } = useOrgPath();
    const [dismissed, setDismissed] = useState(() => sessionStorage.getItem(DISMISS_KEY) === '1');

    if (loading || workflow.configured || dismissed) return null;

    return (
        <div id="workflow-setup-banner" className="mx-4 mt-4 mb-2 flex items-center gap-3 rounded-xl border border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50 px-4 py-3 shadow-sm">
            <Workflow className="w-5 h-5 text-blue-600 shrink-0" />
            <div className="flex-1 text-sm text-gray-800">
                <span className="font-semibold">Tell us how you run your jobs</span>
                <span className="text-gray-600"> — 1 minute. Right now we're assuming a {WORKFLOW_LABELS.teamType[workflow.teamType].toLowerCase()}.</span>
            </div>
            <Link to={orgPath('/settings?tab=workflow')} className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700">
                Set up workflow
            </Link>
            <button type="button" aria-label="Dismiss" onClick={() => { sessionStorage.setItem(DISMISS_KEY, '1'); setDismissed(true); }}
                className="p-1 text-gray-400 hover:text-gray-700 cursor-pointer">
                <X className="w-4 h-4" />
            </button>
        </div>
    );
};
