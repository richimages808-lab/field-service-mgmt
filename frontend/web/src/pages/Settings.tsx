import React, { useState } from 'react';
import {
  ServiceZoneManager,
  QuoteTemplateManager,
  PartsInventory,
  AnalyticsDashboard,
  FollowUpEngineSettings
} from '../components';
import { Settings as SettingsIcon, Map, FileText, Package, BarChart3, Clock, Info } from 'lucide-react';

export const Settings: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'zones' | 'quotes' | 'inventory' | 'analytics' | 'followup'>('zones');

  const tabs = [
    { id: 'zones', label: 'Service Zones', icon: Map, description: 'Manage service areas and travel buffers' },
    { id: 'quotes', label: 'Quote Templates', icon: FileText, description: 'Create reusable quote templates' },
    { id: 'inventory', label: 'Parts Inventory', icon: Package, description: 'Track parts and supplies' },
    { id: 'analytics', label: 'Analytics', icon: BarChart3, description: 'View business metrics' },
    { id: 'followup', label: 'Follow-up Engine', icon: Clock, description: 'Configure automated customer follow-up rules and queues' }
  ];

  const getExplanation = () => {
    switch (activeTab) {
      case 'zones':
        return 'Service Zones let you define your geographical coverage areas and set travel time/cost buffers. This allows the AI dispatch engine to assign technicians efficiently, minimize driving distances, and calculate precise route timings.';
      case 'quotes':
        return 'Quote Templates let you pre-configure common packages of parts, labor, and terms. You can quickly insert these templates into new customer quotes to save time and maintain standardized pricing across your team.';
      case 'inventory':
        return 'Parts Inventory tracks items, quantities in stock, reorder thresholds, and bin locations. Keeping this updated ensures the system automatically alerts you of deficits and blocks jobs if parts are unavailable.';
      case 'analytics':
        return 'Analytics provides insights into your company performance, key financial metrics (revenue, gross profit), technician utilization rates, average response times, and booking conversion rates.';
      case 'followup':
        return 'Keep customers engaged after appointments. Define automated email or SMS follow-up sequences to ask for reviews, offer maintenance plans, or request quote feedback, boosting customer retention without manual outreach.';
      default:
        return '';
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="mx-auto">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <SettingsIcon className="w-8 h-8 text-blue-600" />
            <h1 className="text-3xl font-bold text-gray-900">Business Settings</h1>
          </div>
          <p className="text-gray-600">Manage your business operations and configuration</p>
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-lg shadow mb-6">
          <div className="border-b border-gray-200">
            <nav className="flex space-x-8 px-6 overflow-x-auto">
              {tabs.map(tab => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as any)}
                    className={`py-4 px-1 border-b-2 font-medium text-sm whitespace-nowrap flex items-center gap-2 ${
                      activeTab === tab.id
                        ? 'border-blue-500 text-blue-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {tab.label}
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Tab Description */}
          <div className="px-6 py-3 bg-gray-50 border-b border-gray-200">
            <p className="text-sm text-gray-600">
              {tabs.find(t => t.id === activeTab)?.description}
            </p>
          </div>
        </div>

        {/* Content */}
        <div className="space-y-6">
          <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 flex gap-3 shadow-sm">
            <Info className="w-5 h-5 text-indigo-600 mt-0.5 flex-shrink-0" />
            <div>
              <h4 className="font-semibold text-indigo-900 text-sm">About {tabs.find(t => t.id === activeTab)?.label}</h4>
              <p className="text-xs text-indigo-700 mt-1 leading-relaxed">
                {getExplanation()}
              </p>
            </div>
          </div>
          
          <div className="animate-fadeIn">
            {activeTab === 'zones' && <ServiceZoneManager />}
            {activeTab === 'quotes' && <QuoteTemplateManager />}
            {activeTab === 'inventory' && <PartsInventory />}
            {activeTab === 'analytics' && <AnalyticsDashboard dateRange="month" />}
            {activeTab === 'followup' && <FollowUpEngineSettings />}
          </div>
        </div>
      </div>
    </div>
  );
};
