import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { doc, getDoc, updateDoc, collection, query, where, getDocs, setDoc, deleteDoc, addDoc, serverTimestamp } from 'firebase/firestore';
import { useAuth } from '../auth/AuthProvider';
import toast from 'react-hot-toast';
import {
  Clock, Bot, Mail, MessageSquare, Plus, Trash2, Play, X,
  AlertTriangle, CheckCircle2, Settings, Activity, Sparkles, RefreshCw,
  ToggleLeft, ToggleRight, ArrowRight, ShieldAlert, AlertCircle, HelpCircle
} from 'lucide-react';

export interface FollowUpRule {
  id: string;
  enabled: boolean;
  triggerEvent: 
    | 'unanswered_quote' 
    | 'quote_unscheduled' 
    | 'quote_declined'
    | 'missed_appointment' 
    | 'appointment_unconfirmed' 
    | 'tech_running_late' 
    | 'job_completed'
    | 'unpaid_invoice' 
    | 'unanswered_question' 
    | 'maintenance_seasonal';
  delayValue: number;
  delayUnit: 'hours' | 'days';
  actionType: 
    | 'resend_email_sms' 
    | 'ai_call' 
    | 'auto_reschedule' 
    | 'ask_feedback' 
    | 'tech_late_sms' 
    | 'send_review_request';
  maxRetries: number;
}

export interface PendingFollowUp {
  id: string;
  orgId: string;
  customerId: string;
  customerName: string;
  customerPhone?: string;
  customerEmail?: string;
  sourceType: 'quote' | 'question' | 'invoice' | 'job';
  sourceId: string;
  ruleId: string;
  triggerEvent: string;
  actionType: string;
  scheduledAt: any;
  retryCount: number;
  maxRetries: number;
  status: 'pending' | 'completed' | 'cancelled' | 'failed';
}

const TRIGGER_LABELS = {
  unanswered_quote: 'Quote Sent & Unanswered',
  quote_unscheduled: 'Quote Approved but Job Unscheduled',
  quote_declined: 'Quote Declined by Customer',
  missed_appointment: 'Appointment Missed',
  appointment_unconfirmed: 'Appointment Unconfirmed',
  tech_running_late: 'Technician Running Late',
  job_completed: 'Job Completed & Signed',
  unpaid_invoice: 'Invoice Past Due Date',
  unanswered_question: 'Customer Question Pending',
  maintenance_seasonal: 'Seasonal Service / Maintenance Due'
};

const ACTION_LABELS = {
  resend_email_sms: 'Resend via Email/SMS',
  ai_call: 'Trigger AI Phone Agent Call',
  auto_reschedule: 'Auto-Reschedule & Notify',
  ask_feedback: 'Request Feedback Survey',
  tech_late_sms: 'Send ETA Update SMS',
  send_review_request: 'Send Review Request & Receipt'
};

const ACTIONS_BY_TRIGGER: Record<string, string[]> = {
  unanswered_quote: ['resend_email_sms', 'ai_call'],
  quote_unscheduled: ['resend_email_sms', 'ai_call'],
  quote_declined: ['ask_feedback', 'ai_call'],
  missed_appointment: ['auto_reschedule'],
  appointment_unconfirmed: ['resend_email_sms', 'ai_call'],
  tech_running_late: ['tech_late_sms'],
  job_completed: ['send_review_request', 'ai_call'],
  unpaid_invoice: ['resend_email_sms', 'ai_call'],
  unanswered_question: ['resend_email_sms', 'ai_call'],
  maintenance_seasonal: ['resend_email_sms', 'ai_call']
};

export const FollowUpEngineSettings: React.FC = () => {
  const { user, organization } = useAuth();
  const [activeTab, setActiveTab] = useState<'rules' | 'queue'>('rules');
  const [loading, setLoading] = useState(true);
  const [savingRule, setSavingRule] = useState(false);
  const [rules, setRules] = useState<FollowUpRule[]>([]);
  const [queue, setQueue] = useState<PendingFollowUp[]>([]);
  const [loadingQueue, setLoadingQueue] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);

  // New Rule Form State
  const [triggerEvent, setTriggerEvent] = useState<FollowUpRule['triggerEvent']>('unanswered_quote');
  const [actionType, setActionType] = useState<FollowUpRule['actionType']>('resend_email_sms');
  const [delayValue, setDelayValue] = useState<number>(24);
  const [delayUnit, setDelayUnit] = useState<FollowUpRule['delayUnit']>('hours');
  const [maxRetries, setMaxRetries] = useState<number>(3);

  // Auto-adjust action based on trigger rules
  useEffect(() => {
    const validActions = ACTIONS_BY_TRIGGER[triggerEvent] || [];
    if (validActions.length > 0 && !validActions.includes(actionType)) {
      setActionType(validActions[0] as any);
    }
  }, [triggerEvent]);

  // Load rules from Organization Settings
  const loadRules = async () => {
    if (!organization?.id) return;
    setLoading(true);
    try {
      const orgRef = doc(db, 'organizations', organization.id);
      const snap = await getDoc(orgRef);
      if (snap.exists()) {
        const data = snap.data();
        const existingRules = data.settings?.followUpRules || [];
        setRules(existingRules);
      }
    } catch (err) {
      console.error('Failed to load follow-up rules:', err);
      toast.error('Could not load follow-up rules');
    } finally {
      setLoading(false);
    }
  };

  // Load Pending Follow-up Queue
  const loadQueue = async () => {
    if (!organization?.id) return;
    setLoadingQueue(true);
    try {
      const qRef = collection(db, 'pending_followups');
      const q = query(
        qRef,
        where('orgId', '==', organization.id),
        where('status', '==', 'pending')
      );
      const snapshot = await getDocs(q);
      const queueData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as PendingFollowUp[];

      // Sort by scheduled time ascending
      queueData.sort((a, b) => {
        const aTime = a.scheduledAt?.toDate?.() || new Date(a.scheduledAt);
        const bTime = b.scheduledAt?.toDate?.() || new Date(b.scheduledAt);
        return aTime.getTime() - bTime.getTime();
      });

      setQueue(queueData);
    } catch (err) {
      console.error('Failed to load pending follow-ups:', err);
      toast.error('Could not load pending queue');
    } finally {
      setLoadingQueue(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'rules') {
      loadRules();
    } else {
      loadQueue();
    }
  }, [organization?.id, activeTab]);

  // Save rules array to Organization
  const saveRulesToDb = async (updatedRules: FollowUpRule[]) => {
    if (!organization?.id) return;
    try {
      const orgRef = doc(db, 'organizations', organization.id);
      await updateDoc(orgRef, {
        'settings.followUpRules': updatedRules
      });
      setRules(updatedRules);
      return true;
    } catch (err) {
      console.error('Failed to save follow-up rules:', err);
      toast.error('Failed to save settings');
      return false;
    }
  };

  // Add a new follow-up rule
  const handleAddRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (delayValue <= 0) {
      toast.error('Please enter a positive delay value');
      return;
    }
    setSavingRule(true);
    
    const newRule: FollowUpRule = {
      id: crypto.randomUUID(),
      enabled: true,
      triggerEvent,
      delayValue,
      delayUnit,
      actionType,
      maxRetries
    };

    const updatedRules = [...rules, newRule];
    const success = await saveRulesToDb(updatedRules);
    
    setSavingRule(false);
    if (success) {
      toast.success('Follow-up rule added successfully!');
      setShowAddForm(false);
      // Reset form defaults
      setDelayValue(24);
      setDelayUnit('hours');
      setMaxRetries(3);
    }
  };

  // Toggle rule enabled/disabled
  const handleToggleRule = async (ruleId: string) => {
    const updatedRules = rules.map(r => {
      if (r.id === ruleId) {
        const nextState = !r.enabled;
        toast.success(nextState ? 'Rule enabled' : 'Rule disabled');
        return { ...r, enabled: nextState };
      }
      return r;
    });
    await saveRulesToDb(updatedRules);
  };

  // Delete a rule
  const handleDeleteRule = async (ruleId: string) => {
    if (!window.confirm('Are you sure you want to delete this rule?')) return;
    const updatedRules = rules.filter(r => r.id !== ruleId);
    const success = await saveRulesToDb(updatedRules);
    if (success) {
      toast.success('Rule deleted');
    }
  };

  // Run a pending follow-up action immediately
  const handleRunNow = async (item: PendingFollowUp) => {
    const loadingToast = toast.loading('Executing follow-up action...');
    try {
      // 1. Log the execution/simulation of the action
      if (item.actionType === 'resend_email_sms') {
        // Mocking communication sending
        console.log(`[FollowUp] Resending communication for ${item.sourceType} ${item.sourceId}`);
      } else if (item.actionType === 'ai_call') {
        // Triggering an AI callback
        await addDoc(collection(db, 'pending_callbacks'), {
          orgId: item.orgId,
          customerPhone: item.customerPhone || '',
          customerName: item.customerName || 'Customer',
          quoteId: item.sourceType === 'quote' ? item.sourceId : '',
          jobId: item.sourceType === 'job' ? item.sourceId : '',
          status: 'pending',
          source: 'automated_followup_call',
          createdAt: serverTimestamp()
        });
      } else if (item.actionType === 'auto_reschedule') {
        // Auto-reschedule logic: simulate finding slots
        console.log(`[FollowUp] Auto rescheduling job ${item.sourceId}`);
      } else if (item.actionType === 'ask_feedback') {
        console.log(`[FollowUp] Requesting feedback survey for customer of ${item.sourceType} ${item.sourceId}`);
      } else if (item.actionType === 'tech_late_sms') {
        console.log(`[FollowUp] Sending ETA late update SMS for job ${item.sourceId}`);
      } else if (item.actionType === 'send_review_request') {
        console.log(`[FollowUp] Sending review request and receipt for job ${item.sourceId}`);
      }

      // 2. Update Firestore document (increment retry count or mark complete)
      const nextRetry = item.retryCount + 1;
      const isCompleted = nextRetry >= item.maxRetries;

      const docRef = doc(db, 'pending_followups', item.id);
      await updateDoc(docRef, {
        retryCount: nextRetry,
        status: isCompleted ? 'completed' : 'pending',
        lastExecutedAt: serverTimestamp(),
        scheduledAt: new Date(Date.now() + 24 * 60 * 60 * 1000) // reschedule next attempt in 1 day
      });

      toast.success(
        isCompleted 
          ? `Follow-up complete! Reached max retries (${item.maxRetries}).`
          : `Attempt ${nextRetry}/${item.maxRetries} executed successfully! Next attempt scheduled.`,
        { id: loadingToast }
      );
      loadQueue();
    } catch (err) {
      console.error('Failed to execute follow-up:', err);
      toast.error('Failed to run follow-up action', { id: loadingToast });
    }
  };

  // Cancel a pending follow-up
  const handleCancelFollowUp = async (itemId: string) => {
    if (!window.confirm('Are you sure you want to cancel this automated follow-up?')) return;
    try {
      const docRef = doc(db, 'pending_followups', itemId);
      await updateDoc(docRef, {
        status: 'cancelled',
        cancelledAt: serverTimestamp()
      });
      toast.success('Follow-up cancelled');
      loadQueue();
    } catch (err) {
      console.error('Failed to cancel follow-up:', err);
      toast.error('Failed to cancel');
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      {/* Sub-tabs header */}
      <div className="flex justify-between items-center bg-gray-50 border-b border-gray-200 px-6 py-4 flex-wrap gap-4">
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab('rules')}
            className={`px-4 py-2 text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 ${
              activeTab === 'rules'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
            }`}
          >
            <Settings className="w-4 h-4" />
            Rules Configuration
          </button>
          <button
            onClick={() => setActiveTab('queue')}
            className={`px-4 py-2 text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 ${
              activeTab === 'queue'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
            }`}
          >
            <Activity className="w-4 h-4" />
            Pending Action Queue
            {queue.length > 0 && (
              <span className="bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold">
                {queue.length}
              </span>
            )}
          </button>
        </div>

        {activeTab === 'rules' && (
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="flex items-center gap-1 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white text-xs font-bold py-2 px-3 rounded-lg shadow transition-all"
          >
            {showAddForm ? <X className="w-4.5 h-4.5" /> : <Plus className="w-4.5 h-4.5" />}
            {showAddForm ? 'Cancel Builder' : 'Build Custom Rule'}
          </button>
        )}
      </div>

      <div className="p-6">
        {activeTab === 'rules' ? (
          <div className="space-y-6">
            {/* Rule Builder Form */}
            {showAddForm && (
              <form onSubmit={handleAddRule} className="bg-gradient-to-br from-blue-50/40 to-indigo-50/20 border-2 border-blue-150 rounded-xl p-5 shadow-sm animate-in slide-in-from-top duration-200">
                <h3 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-blue-500" />
                  Follow-up Rule Orchestrator
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  {/* Trigger Select */}
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">
                      Trigger Event
                    </label>
                    <select
                      value={triggerEvent}
                      onChange={(e) => setTriggerEvent(e.target.value as any)}
                      className="w-full border border-gray-300 rounded-lg p-2.5 text-xs font-semibold focus:ring-2 focus:ring-blue-500 bg-white"
                    >
                      <optgroup label="Quotes &amp; Estimates">
                        <option value="unanswered_quote">Quote Sent but Unanswered</option>
                        <option value="quote_unscheduled">Quote Approved but Job Unscheduled</option>
                        <option value="quote_declined">Quote Declined by Customer</option>
                      </optgroup>
                      <optgroup label="Jobs &amp; Scheduling">
                        <option value="missed_appointment">Appointment Missed</option>
                        <option value="appointment_unconfirmed">Appointment Unconfirmed</option>
                        <option value="tech_running_late">Technician Running Late</option>
                        <option value="job_completed">Job Completed &amp; Signed</option>
                      </optgroup>
                      <optgroup label="Invoicing &amp; Customer Care">
                        <option value="unpaid_invoice">Invoice Past Due Date</option>
                        <option value="unanswered_question">Customer Question Pending</option>
                        <option value="maintenance_seasonal">Seasonal Service / Maintenance Due</option>
                      </optgroup>
                    </select>
                  </div>

                  {/* Action Select */}
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">
                      Action to Take
                    </label>
                    <select
                      value={actionType}
                      onChange={(e) => setActionType(e.target.value as any)}
                      className="w-full border border-gray-300 rounded-lg p-2.5 text-xs font-semibold focus:ring-2 focus:ring-blue-500 bg-white"
                    >
                      {(ACTIONS_BY_TRIGGER[triggerEvent] || []).map((action) => (
                        <option key={action} value={action}>
                          {ACTION_LABELS[action as keyof typeof ACTION_LABELS] || action}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Delay Settings */}
                  <div className="flex gap-2">
                    <div className="w-1/2">
                      <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">
                        Delay Value
                      </label>
                      <input
                        type="number"
                        min="1"
                        value={delayValue}
                        onChange={(e) => setDelayValue(Number(e.target.value))}
                        className="w-full border border-gray-300 rounded-lg p-2 text-xs font-semibold focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div className="w-1/2">
                      <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">
                        Delay Unit
                      </label>
                      <select
                        value={delayUnit}
                        onChange={(e) => setDelayUnit(e.target.value as any)}
                        className="w-full border border-gray-300 rounded-lg p-2.5 text-xs font-semibold focus:ring-2 focus:ring-blue-500 bg-white"
                      >
                        <option value="hours">Hours</option>
                        <option value="days">Days</option>
                      </select>
                    </div>
                  </div>

                  {/* Retries */}
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">
                      Max Execution Retries
                    </label>
                    <select
                      value={maxRetries}
                      onChange={(e) => setMaxRetries(Number(e.target.value))}
                      className="w-full border border-gray-300 rounded-lg p-2.5 text-xs font-semibold focus:ring-2 focus:ring-blue-500 bg-white"
                    >
                      <option value="1">1 Attempt Only</option>
                      <option value="2">Retry Up to 2 times</option>
                      <option value="3">Retry Up to 3 times</option>
                      <option value="4">Retry Up to 4 times</option>
                      <option value="5">Retry Up to 5 times</option>
                    </select>
                  </div>
                </div>

                <div className="flex justify-end gap-2.5 pt-3 border-t border-dashed border-blue-200">
                  <button
                    type="button"
                    onClick={() => setShowAddForm(false)}
                    className="px-4 py-2 border border-gray-300 text-gray-700 text-xs font-bold rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={savingRule}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg shadow-md transition-all flex items-center gap-1 disabled:opacity-50"
                  >
                    {savingRule ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                    Save Follow-up Rule
                  </button>
                </div>
              </form>
            )}

            {/* Rules List */}
            {loading ? (
              <div className="flex items-center gap-2 py-6 text-xs text-gray-500 justify-center">
                <RefreshCw className="w-4 h-4 animate-spin text-indigo-500" />
                Loading rules configuration...
              </div>
            ) : rules.length === 0 ? (
              <div className="text-center py-12 border border-dashed border-gray-200 rounded-xl bg-slate-50/50">
                <Activity className="mx-auto h-12 w-12 text-gray-400" />
                <h3 className="mt-2 text-sm font-bold text-gray-900">No follow-up rules set up</h3>
                <p className="mt-1 text-xs text-gray-500 max-w-sm mx-auto">
                  Automate notifications and callbacks when customers fail to respond. Click "Build Custom Rule" above to configure your first flow.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {rules.map((rule) => (
                  <div
                    key={rule.id}
                    className={`border rounded-xl p-4 transition-all duration-200 shadow-sm ${
                      rule.enabled 
                        ? 'border-indigo-150 bg-indigo-50/5 hover:shadow-md' 
                        : 'border-gray-200 bg-gray-50/40 opacity-70'
                    }`}
                  >
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                          rule.triggerEvent === 'unanswered_quote' ? 'bg-indigo-100 text-indigo-800 border border-indigo-150' :
                          rule.triggerEvent === 'unanswered_question' ? 'bg-amber-100 text-amber-800 border border-amber-150' :
                          rule.triggerEvent === 'unpaid_invoice' ? 'bg-rose-100 text-rose-800 border border-rose-150' :
                          'bg-emerald-100 text-emerald-800 border border-emerald-150'
                        }`}>
                          {TRIGGER_LABELS[rule.triggerEvent] || rule.triggerEvent}
                        </span>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleToggleRule(rule.id)}
                          className="text-gray-400 hover:text-gray-600 focus:outline-none transition-colors"
                          title={rule.enabled ? 'Disable rule' : 'Enable rule'}
                        >
                          {rule.enabled ? (
                            <ToggleRight className="w-7 h-7 text-indigo-600" />
                          ) : (
                            <ToggleLeft className="w-7 h-7 text-gray-450" />
                          )}
                        </button>
                        <button
                          onClick={() => handleDeleteRule(rule.id)}
                          className="text-gray-450 hover:text-red-600 p-1 rounded hover:bg-gray-100/80 transition-colors"
                          title="Delete rule"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    <div className="space-y-2.5 text-xs text-gray-600">
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-gray-400 shrink-0" />
                        <span>
                          Trigger delay: <strong className="text-gray-800 font-semibold">{rule.delayValue} {rule.delayUnit}</strong>
                        </span>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <Bot className="w-4 h-4 text-indigo-500 shrink-0" />
                        <span>
                          Action type: <strong className="text-gray-800 font-semibold">{ACTION_LABELS[rule.actionType] || rule.actionType}</strong>
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <RefreshCw className="w-4 h-4 text-gray-400 shrink-0" />
                        <span>
                          Maximum retry attempts: <strong className="text-gray-800 font-semibold">{rule.maxRetries}</strong>
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          /* Pending Queue */
          <div className="space-y-4">
            {loadingQueue ? (
              <div className="flex items-center gap-2 py-6 text-xs text-gray-500 justify-center">
                <RefreshCw className="w-4 h-4 animate-spin text-indigo-500" />
                Loading pending follow-ups...
              </div>
            ) : queue.length === 0 ? (
              <div className="text-center py-12 border border-dashed border-gray-200 rounded-xl bg-slate-50/50">
                <Activity className="mx-auto h-12 w-12 text-gray-400" />
                <h3 className="mt-2 text-sm font-bold text-gray-900">Queue is completely empty</h3>
                <p className="mt-1 text-xs text-gray-500 max-w-sm mx-auto">
                  No automated follow-ups are currently scheduled. When rules match open quotes/invoices, they will schedule follow-ups here.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto border border-gray-200 rounded-xl shadow-sm bg-white">
                <table className="min-w-full divide-y divide-gray-200 text-xs">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-5 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Customer</th>
                      <th className="px-5 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Source</th>
                      <th className="px-5 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Trigger</th>
                      <th className="px-5 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Action</th>
                      <th className="px-5 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Scheduled Execution</th>
                      <th className="px-5 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Retries</th>
                      <th className="px-5 py-3 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-150 bg-white">
                    {queue.map((item) => {
                      const date = item.scheduledAt?.toDate?.() || new Date(item.scheduledAt);
                      return (
                        <tr key={item.id} className="hover:bg-blue-50/20 transition-colors">
                          <td className="px-5 py-3.5 whitespace-nowrap">
                            <div className="font-semibold text-gray-900">{item.customerName}</div>
                            {item.customerEmail && <div className="text-[10px] text-gray-400 font-normal">{item.customerEmail}</div>}
                          </td>
                          <td className="px-5 py-3.5 whitespace-nowrap font-mono font-medium text-gray-500">
                            {item.sourceType.toUpperCase()}: {item.sourceId.substring(0, 8)}
                          </td>
                          <td className="px-5 py-3.5 whitespace-nowrap text-gray-700">
                            {TRIGGER_LABELS[item.triggerEvent as keyof typeof TRIGGER_LABELS] || item.triggerEvent}
                          </td>
                          <td className="px-5 py-3.5 whitespace-nowrap font-semibold text-indigo-700">
                            {ACTION_LABELS[item.actionType as keyof typeof ACTION_LABELS] || item.actionType}
                          </td>
                          <td className="px-5 py-3.5 whitespace-nowrap text-gray-500">
                            {date.toLocaleString()}
                          </td>
                          <td className="px-5 py-3.5 whitespace-nowrap font-semibold">
                            <span className={`px-2 py-0.5 rounded text-[10px] ${
                              item.retryCount > 0 ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-700'
                            }`}>
                              {item.retryCount} / {item.maxRetries}
                            </span>
                          </td>
                          <td className="px-5 py-3.5 whitespace-nowrap text-right text-sm font-medium space-x-1" onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={() => handleRunNow(item)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 text-indigo-800 rounded-lg text-xs font-bold transition-colors shadow-sm"
                              title="Run follow-up action now"
                            >
                              <Play className="w-3.5 h-3.5 fill-indigo-800 stroke-none" />
                              Run Now
                            </button>
                            <button
                              onClick={() => handleCancelFollowUp(item.id)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-rose-50 border border-rose-200 hover:bg-rose-100 text-rose-800 rounded-lg text-xs font-bold transition-colors shadow-sm"
                              title="Cancel follow-up"
                            >
                              <X className="w-3.5 h-3.5" />
                              Cancel
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
