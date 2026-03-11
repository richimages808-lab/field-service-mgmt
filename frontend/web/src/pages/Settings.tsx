import React, { useState } from 'react';
import {
  ServiceZoneManager,
  QuoteTemplateManager,
  PartsInventory,
  AnalyticsDashboard
} from '../components';
import { Settings as SettingsIcon, Map, FileText, Package, BarChart3 } from 'lucide-react';

export const Settings: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'zones' | 'quotes' | 'inventory' | 'analytics'>('zones');

  const tabs = [
    { id: 'zones', label: 'Service Zones', icon: Map, description: 'Manage service areas and travel buffers' },
    { id: 'quotes', label: 'Quote Templates', icon: FileText, description: 'Create reusable quote templates' },
    { id: 'inventory', label: 'Parts Inventory', icon: Package, description: 'Track parts and supplies' },
    { id: 'analytics', label: 'Analytics', icon: BarChart3, description: 'View business metrics' }
  ];

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-7xl mx-auto">
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
        <div className="animate-fadeIn">
          {activeTab === 'zones' && <ServiceZoneManager />}
          {activeTab === 'quotes' && <QuoteTemplateManager />}
          {activeTab === 'inventory' && <PartsInventory />}
          {activeTab === 'analytics' && <AnalyticsDashboard dateRange="month" />}
        </div>
      </div>
    </div>
  );
};
