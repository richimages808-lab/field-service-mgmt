/**
 * TrackerDeviceFormModal.tsx - Register or edit a tracker device
 *
 * - Pick the tracker type (catalog model) → role is derived (gateway / tag / standalone)
 * - Tags can be nested under a registered gateway (e.g. Minew MG5)
 * - Assign to a technician, vehicle, tool record, or location
 * - Duplicate identifier protection within the organization
 */
import React, { useEffect, useMemo, useState } from 'react';
import { X, Radio, Tag as TagIcon, Router, Save, Loader2, Info } from 'lucide-react';
import toast from 'react-hot-toast';
import { getGroupedTrackerCatalog } from '../../utils/trackerCatalog';
import { TrackerDevice, TrackerAssigneeType } from '../../types/trackerDevices';
import {
    getModel,
    roleForModel,
    identifierLabelForRole,
    normalizeIdentifier,
    formatMac,
    registerTrackerDevice,
    updateTrackerDevice
} from '../../lib/trackerDevices';

export interface TrackerFormPrefill {
    modelId?: string;
    identifier?: string;
    parentDeviceId?: string | null;
}

interface Props {
    isOpen: boolean;
    onClose: () => void;
    onSaved?: (deviceId: string, info: { created: boolean; role: string }) => void;
    orgId: string;
    devices: TrackerDevice[];
    people: Array<{ id: string; name: string }>;
    tools: Array<{ id: string; name: string }>;
    editing?: TrackerDevice | null;
    prefill?: TrackerFormPrefill | null;
}

const ASSIGNEE_OPTIONS: Array<{ value: TrackerAssigneeType; label: string }> = [
    { value: 'tech', label: 'Technician' },
    { value: 'vehicle', label: 'Vehicle' },
    { value: 'tool', label: 'Tool / Equipment' },
    { value: 'location', label: 'Location (Shop, Warehouse…)' },
    { value: 'none', label: 'Unassigned' }
];

export const TrackerDeviceFormModal: React.FC<Props> = ({
    isOpen, onClose, onSaved, orgId, devices, people, tools, editing, prefill
}) => {
    const grouped = useMemo(() => getGroupedTrackerCatalog(), []);
    const gateways = useMemo(() => devices.filter(d => d.role === 'gateway'), [devices]);

    const [modelId, setModelId] = useState('minew_mg5');
    const [label, setLabel] = useState('');
    const [identifier, setIdentifier] = useState('');
    const [serial, setSerial] = useState('');
    const [parentDeviceId, setParentDeviceId] = useState<string>('');
    const [assignedToType, setAssignedToType] = useState<TrackerAssigneeType>('tech');
    const [assignedToId, setAssignedToId] = useState('');
    const [assignedToName, setAssignedToName] = useState('');
    const [linkedToolId, setLinkedToolId] = useState('');
    const [batteryDate, setBatteryDate] = useState(new Date().toISOString().slice(0, 10));
    const [notes, setNotes] = useState('');
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!isOpen) return;
        if (editing) {
            setModelId(editing.modelId);
            setLabel(editing.label);
            setIdentifier(editing.identifier);
            setSerial(editing.serial || '');
            setParentDeviceId(editing.parentDeviceId || '');
            setAssignedToType(editing.assignedToType || 'none');
            setAssignedToId(editing.assignedToId || '');
            setAssignedToName(editing.assignedToName || '');
            setLinkedToolId(editing.linkedToolId || '');
            setBatteryDate((editing.batteryInstalledDate || new Date().toISOString()).slice(0, 10));
            setNotes(editing.notes || '');
        } else {
            const startModel = getModel(prefill?.modelId || 'minew_mg5');
            setModelId(startModel.id);
            setLabel('');
            setIdentifier(prefill?.identifier || '');
            setSerial('');
            setParentDeviceId(prefill?.parentDeviceId || '');
            setAssignedToType(roleForModel(startModel) === 'gateway' ? 'vehicle' : 'tech');
            setAssignedToId('');
            setAssignedToName('');
            setLinkedToolId('');
            setBatteryDate(new Date().toISOString().slice(0, 10));
            setNotes('');
        }
    }, [isOpen, editing, prefill]);

    const model = getModel(modelId);
    const role = roleForModel(model);
    const idField = identifierLabelForRole(role, model);

    // When a tag is placed under a gateway and has no assignee yet, inherit the gateway's assignee
    useEffect(() => {
        if (role !== 'tag' || !parentDeviceId || editing) return;
        const gw = gateways.find(g => g.id === parentDeviceId);
        if (gw && gw.assignedToType !== 'none' && !assignedToId && !assignedToName) {
            setAssignedToType(gw.assignedToType);
            setAssignedToId(gw.assignedToId || '');
            setAssignedToName(gw.assignedToName || '');
        }
    }, [parentDeviceId, role]); // eslint-disable-line react-hooks/exhaustive-deps

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!label.trim()) return toast.error(role === 'gateway' ? 'Give this gateway a name, like "Van 3".' : 'Give this device a name.');
        if (!identifier.trim()) return toast.error(`${idField.label.replace(' *', '')} is required.`);

        const usesMac = role === 'tag' || role === 'gateway';
        const key = normalizeIdentifier(usesMac ? formatMac(identifier) : identifier);
        const dup = devices.find(d => d.identifierKey === key && d.id !== editing?.id);
        if (dup) return toast.error(`That MAC address is already in your account as "${dup.label}".`);
        if (usesMac && !editing?.isDemo && !/^[0-9A-F]{12}$/.test(key)) {
            return toast.error('The MAC address should be 12 letters and numbers, e.g. AC:23:3F:12:34:56. You\'ll find it on the label.');
        }
        if (editing && role === 'gateway' && editing.connection?.mqttUsername && key !== editing.identifierKey) {
            toast('Note: Changing the MAC address requires reconnecting this gateway.', { icon: 'ℹ️' });
        }

        const person = people.find(p => p.id === assignedToId);
        const tool = tools.find(t => t.id === (assignedToType === 'tool' ? assignedToId : linkedToolId));
        const resolvedName =
            assignedToType === 'tech' ? person?.name || null :
            assignedToType === 'tool' ? tool?.name || null :
            assignedToType === 'none' ? null : assignedToName.trim() || null;

        const payload = {
            modelId,
            label: label.trim(),
            identifier: usesMac && !editing?.isDemo ? formatMac(identifier) : identifier.trim(),
            serial: serial.trim(),
            parentDeviceId: role === 'tag' ? parentDeviceId || null : null,
            assignedToType,
            assignedToId: assignedToType === 'tech' || assignedToType === 'tool' ? assignedToId || null : null,
            assignedToName: resolvedName,
            linkedToolId: (assignedToType === 'tool' ? assignedToId : linkedToolId) || null,
            linkedToolName: tool?.name || null,
            batteryInstalledDate: new Date(batteryDate + 'T12:00:00').toISOString(),
            notes
        };

        setSaving(true);
        try {
            if (editing) {
                await updateTrackerDevice(editing.id, { ...payload, role } as Partial<TrackerDevice>);
                toast.success(`Updated ${payload.label}`);
                onSaved?.(editing.id, { created: false, role });
            } else {
                const id = await registerTrackerDevice(orgId, payload);
                toast.success(`Added ${payload.label}`);
                onSaved?.(id, { created: true, role });
            }
            onClose();
        } catch (err: any) {
            console.error('Tracker save failed', err);
            toast.error(err?.message || 'Could not save device');
        } finally {
            setSaving(false);
        }
    };

    const RoleIcon = role === 'gateway' ? Router : role === 'tag' ? TagIcon : Radio;
    const inputCls = 'w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 bg-white';
    const labelCls = 'block text-xs font-bold text-slate-600 mb-1';

    return (
        <div className="fixed inset-0 z-[1000] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
            <form
                onClick={e => e.stopPropagation()}
                onSubmit={handleSubmit}
                className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl max-h-[92vh] flex flex-col overflow-hidden"
            >
                <div className="px-6 py-4 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-xl bg-white/10"><RoleIcon className="w-5 h-5" /></div>
                        <div>
                            <h2 className="text-lg font-black text-white">{editing ? `Edit ${editing.label}` : role === 'gateway' ? 'Add a Gateway' : 'Add a Tracker'}</h2>
                            <p className="text-xs text-indigo-200">{role === 'gateway' ? 'The box in the vehicle that reports its location and the tags near it' : role === 'tag' ? 'A small tag you stick on a tool or piece of equipment' : 'A tracker that reports on its own'}</p>
                        </div>
                    </div>
                    <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-white/10" aria-label="Close"><X className="w-5 h-5" /></button>
                </div>

                <div className="p-6 space-y-5 overflow-y-auto">
                    <div>
                        <label className={labelCls} htmlFor="trk-model">What are you adding? *</label>
                        <select id="trk-model" className={inputCls} value={modelId} onChange={e => setModelId(e.target.value)} disabled={!!editing}>
                            {grouped.map(g => (
                                <optgroup key={g.groupName} label={g.groupName}>
                                    {g.items.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                                </optgroup>
                            ))}
                        </select>
                        <div className="mt-2 flex items-start gap-2 text-[11px] text-slate-600 bg-slate-50 border border-slate-200 rounded-lg p-2">
                            <Info className="w-3.5 h-3.5 mt-0.5 text-blue-600 shrink-0" />
                            <span>
                                <strong className="uppercase tracking-wide">{role}</strong>
                                {role === 'gateway' && ' — reports its own GPS location and picks up the tags near it. You can put tags under it.'}
                                {role === 'tag' && ' — has no GPS of its own. Its location comes from whichever gateway is near it.'}
                                {role === 'standalone' && ' — reports on its own (or via its vendor app). No tags nest under it.'}
                                {' '}{model.batteryLife}.
                            </span>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className={labelCls} htmlFor="trk-label">Name *</label>
                            <input id="trk-label" className={inputCls} value={label} onChange={e => setLabel(e.target.value)}
                                placeholder={role === 'gateway' ? 'e.g. Van 3' : role === 'tag' ? 'e.g. Press Tool' : 'e.g. Trailer GPS'} />
                            <p className="text-[11px] text-slate-500 mt-1">What your team calls it.</p>
                        </div>
                        <div>
                            <label className={labelCls} htmlFor="trk-identifier">{idField.label}</label>
                            <input id="trk-identifier" className={`${inputCls} font-mono`} value={identifier} onChange={e => setIdentifier(e.target.value)} placeholder={idField.placeholder}
                                onBlur={() => { if ((role === 'tag' || role === 'gateway') && /^[0-9A-F]{12}$/.test(normalizeIdentifier(identifier))) setIdentifier(formatMac(identifier)); }} />
                            {idField.hint && <p className="text-[11px] text-slate-500 mt-1">{idField.hint}</p>}
                        </div>
                        <div>
                            <label className={labelCls} htmlFor="trk-serial">Serial Number (optional)</label>
                            <input id="trk-serial" className={inputCls} value={serial} onChange={e => setSerial(e.target.value)} placeholder="Also on the label" />
                        </div>
                        {role === 'tag' && (
                            <div>
                                <label className={labelCls} htmlFor="trk-parent">Assigned Gateway</label>
                                <select id="trk-parent" className={inputCls} value={parentDeviceId} onChange={e => setParentDeviceId(e.target.value)}>
                                    <option value="">— Not assigned to a gateway —</option>
                                    {gateways.map(g => <option key={g.id} value={g.id}>{g.label}</option>)}
                                </select>
                                {gateways.length === 0 && <p className="text-[11px] text-amber-600 mt-1">Register a gateway (e.g. Minew MG5) first to nest tags under it.</p>}
                            </div>
                        )}
                    </div>

                    <div className="rounded-2xl border border-slate-200 p-4 space-y-3 bg-slate-50/50">
                        <h3 className="text-xs font-black uppercase tracking-wider text-slate-500">{role === 'gateway' ? 'Where is it installed?' : 'Who or what is it on?'}</h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label className={labelCls} htmlFor="trk-assignee-type">Assigned To</label>
                                <select id="trk-assignee-type" className={inputCls} value={assignedToType}
                                    onChange={e => { setAssignedToType(e.target.value as TrackerAssigneeType); setAssignedToId(''); setAssignedToName(''); }}>
                                    {ASSIGNEE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                </select>
                            </div>
                            <div>
                                {assignedToType === 'tech' && (
                                    <>
                                        <label className={labelCls} htmlFor="trk-assignee">Technician</label>
                                        <select id="trk-assignee" className={inputCls} value={assignedToId} onChange={e => setAssignedToId(e.target.value)}>
                                            <option value="">Select technician…</option>
                                            {people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                        </select>
                                    </>
                                )}
                                {assignedToType === 'tool' && (
                                    <>
                                        <label className={labelCls} htmlFor="trk-assignee-tool">Tool Record</label>
                                        <select id="trk-assignee-tool" className={inputCls} value={assignedToId} onChange={e => setAssignedToId(e.target.value)}>
                                            <option value="">Select tool…</option>
                                            {tools.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                                        </select>
                                    </>
                                )}
                                {(assignedToType === 'vehicle' || assignedToType === 'location') && (
                                    <>
                                        <label className={labelCls} htmlFor="trk-assignee-name">{assignedToType === 'vehicle' ? 'Vehicle' : 'Location'} Name</label>
                                        <input id="trk-assignee-name" className={inputCls} value={assignedToName} onChange={e => setAssignedToName(e.target.value)}
                                            placeholder={assignedToType === 'vehicle' ? 'e.g. 2022 Ford Transit #3' : 'e.g. Kalihi Shop'} />
                                    </>
                                )}
                            </div>
                            {role === 'tag' && assignedToType !== 'tool' && (
                                <div className="sm:col-span-2">
                                    <label className={labelCls} htmlFor="trk-linked-tool">Attached To Tool (optional)</label>
                                    <select id="trk-linked-tool" className={inputCls} value={linkedToolId} onChange={e => setLinkedToolId(e.target.value)}>
                                        <option value="">— None —</option>
                                        {tools.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                                    </select>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className={labelCls} htmlFor="trk-battery-date">Battery Installed / Activated</label>
                            <input id="trk-battery-date" type="date" className={inputCls} value={batteryDate} onChange={e => setBatteryDate(e.target.value)} />
                            <p className="text-[11px] text-slate-500 mt-1">{model.batteryType} · est. {model.estimatedLifespanMonths} months</p>
                        </div>
                        <div>
                            <label className={labelCls} htmlFor="trk-notes">Notes</label>
                            <textarea id="trk-notes" rows={2} className={inputCls} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Mounting location, SIM ICCID, etc." />
                        </div>
                    </div>
                </div>

                <div className="px-6 py-4 border-t bg-slate-50 flex justify-end gap-2">
                    <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-200">Cancel</button>
                    <button id="trk-save" type="submit" disabled={saving}
                        className="px-5 py-2 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-md disabled:opacity-60 flex items-center gap-2">
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        {editing ? 'Save Changes' : role === 'gateway' ? 'Add Gateway & Connect' : 'Add Device'}
                    </button>
                </div>
            </form>
        </div>
    );
};

export default TrackerDeviceFormModal;
