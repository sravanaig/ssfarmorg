
import React, { useState, useMemo, useRef, useEffect } from 'react';
import type { Customer, Delivery } from '../types';
import { UploadIcon, DownloadIcon, GridIcon, ListIcon, SearchIcon } from './Icons';
import { supabase } from '../lib/supabaseClient';
import { getFriendlyErrorMessage } from '../lib/errorHandler';
import QuantityInput from './QuantityInput';
import Modal from './Modal';

interface DeliveryManagerProps {
  customers: Customer[];
  deliveries: Delivery[];
  setDeliveries: React.Dispatch<React.SetStateAction<Delivery[]>>;
}

const downloadCSV = (csvContent: string, filename: string) => {
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};

interface BulkImportModalProps {
    isOpen: boolean;
    onClose: () => void;
    onDownloadTemplate: (month: string) => void;
    onFileImport: (event: React.ChangeEvent<HTMLInputElement>, month: string) => void;
}

const BulkImportModal: React.FC<BulkImportModalProps> = ({ isOpen, onClose, onDownloadTemplate, onFileImport }) => {
    const [importMonth, setImportMonth] = useState(new Date().toISOString().substring(0, 7));
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleUploadClick = () => {
        if (!importMonth) {
            alert("Please select a month first.");
            return;
        }
        fileInputRef.current?.click();
    };
    
    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Bulk Import Monthly Deliveries">
            <div className="space-y-6">
                <div>
                    <h4 className="font-semibold text-gray-800">Step 1: Select Month</h4>
                    <p className="text-sm text-gray-600">Choose the month you want to import data for.</p>
                    <input
                        type="month"
                        value={importMonth}
                        onChange={e => setImportMonth(e.target.value)}
                        className="mt-2 w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    />
                </div>
                <div>
                    <h4 className="font-semibold text-gray-800">Step 2: Download & Fill Template</h4>
                    <p className="text-sm text-gray-600">Download a pre-filled CSV template with your active customers. Edit the file to add the daily delivery quantities.</p>
                    <button
                        onClick={() => onDownloadTemplate(importMonth)}
                        disabled={!importMonth}
                        className="mt-2 flex items-center px-4 py-2 text-sm bg-gray-600 text-white rounded-lg shadow-sm hover:bg-gray-700 transition-colors disabled:opacity-50"
                    >
                        <DownloadIcon className="h-4 w-4 mr-2"/> Download Template
                    </button>
                </div>
                <div>
                    <h4 className="font-semibold text-gray-800">Step 3: Upload Completed File</h4>
                    <p className="text-sm text-gray-600">Once you've filled out the template, upload it here. Existing deliveries for the selected month will be updated.</p>
                    <input
                        type="file"
                        ref={fileInputRef}
                        onChange={(e) => onFileImport(e, importMonth)}
                        className="hidden"
                        accept=".csv"
                    />
                    <button
                        onClick={handleUploadClick}
                        disabled={!importMonth}
                        className="mt-2 flex items-center px-4 py-2 text-sm bg-blue-600 text-white rounded-lg shadow-sm hover:bg-blue-700 transition-colors disabled:opacity-50"
                    >
                        <UploadIcon className="h-4 w-4 mr-2"/> Upload File
                    </button>
                </div>
                 <div className="flex justify-end pt-4 border-t">
                    <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300">Close</button>
                </div>
            </div>
        </Modal>
    );
}

const DeliveryManager: React.FC<DeliveryManagerProps> = ({ customers, deliveries, setDeliveries }) => {
  // Common state
  const [isSaving, setIsSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  
  // View mode state
  const [mode, setMode] = useState<'daily' | 'monthly'>('daily');

  // Daily mode state
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [pendingChanges, setPendingChanges] = useState<Map<string, number>>(new Map());
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  // Monthly mode state
  const [selectedMonthlyCustomer, setSelectedMonthlyCustomer] = useState<string>('');
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().substring(0, 7)); // YYYY-MM
  const [monthlyPendingChanges, setMonthlyPendingChanges] = useState<Map<string, number>>(new Map());


  const activeCustomers = useMemo(() => customers.filter(c => c.status === 'active').sort((a,b) => a.name.localeCompare(b.name)), [customers]);

  const filteredActiveCustomers = useMemo(() => {
    if (!searchTerm.trim()) {
      return activeCustomers;
    }
    const lowercasedFilter = searchTerm.toLowerCase();
    return activeCustomers.filter(customer =>
      customer.name.toLowerCase().includes(lowercasedFilter)
    );
  }, [activeCustomers, searchTerm]);

  // Effect to clear pending changes on date/mode/customer change
  useEffect(() => {
    setPendingChanges(new Map());
    setMonthlyPendingChanges(new Map());
  }, [selectedDate, selectedMonth, selectedMonthlyCustomer, mode]);

  // --- Daily Mode Logic ---
  const deliveriesForDate = useMemo(() => {
    const deliveryMap = new Map<string, number>();
    deliveries.forEach(d => {
        if (d.date === selectedDate) {
            deliveryMap.set(d.customerId, d.quantity);
        }
    });
    return deliveryMap;
  }, [deliveries, selectedDate]);

  const handleQuantityChange = (customerId: string, newQuantityStr: string) => {
    const newQuantity = parseFloat(newQuantityStr);
    if (newQuantityStr === '') {
        setPendingChanges(prev => new Map<string, number>(prev).set(customerId, 0));
        return;
    }
    if (isNaN(newQuantity) || newQuantity < 0) return;
    setPendingChanges(prev => new Map<string, number>(prev).set(customerId, newQuantity));
  };
  
  const getDisplayQuantity = (customerId: string): number | string => {
    if (pendingChanges.has(customerId)) {
        return pendingChanges.get(customerId)!;
    }
    const deliveryQty = deliveriesForDate.get(customerId);
    return deliveryQty !== undefined ? deliveryQty : 0;
  }
  
  const handleSave = async () => {
    setIsSaving(true);
    const changesToProcess = new Map<string, number>();
    filteredActiveCustomers.forEach(customer => {
        const displayQuantity = getDisplayQuantity(customer.id);
        const finalQuantity = (typeof displayQuantity === 'string' && displayQuantity === '') ? 0 : Number(displayQuantity);
        const existingDelivery = deliveries.find(d => d.customerId === customer.id && d.date === selectedDate);
        const existingQuantity = existingDelivery?.quantity;

        if (finalQuantity !== existingQuantity) {
             if (existingDelivery === undefined && finalQuantity === 0) {
                 return;
             }
             changesToProcess.set(customer.id, finalQuantity);
        }
    });

    if (changesToProcess.size === 0) {
        alert("No changes to save.");
        setIsSaving(false);
        return;
    }
    try {
        const changes = Array.from(changesToProcess.entries());
        const deliveriesToUpsert = changes.filter(([, quantity]) => quantity > 0).map(([customerId, quantity]) => ({ customerId, date: selectedDate, quantity }));
        const customerIdsToDelete = changes.filter(([, quantity]) => quantity === 0).map(([customerId]) => customerId).filter(id => deliveriesForDate.has(id));

        const upsertPromise = deliveriesToUpsert.length > 0 ? supabase.from('deliveries').upsert(deliveriesToUpsert, { onConflict: 'customerId,date' }).select() : Promise.resolve({ data: [], error: null });
        const deletePromise = customerIdsToDelete.length > 0 ? supabase.from('deliveries').delete().eq('date', selectedDate).in('customerId', customerIdsToDelete) : Promise.resolve({ error: null });
        const [upsertResult, deleteResult] = await Promise.all([upsertPromise, deletePromise]);

        if (upsertResult.error) throw upsertResult.error;
        if (deleteResult.error) throw deleteResult.error;
        
        setDeliveries(prev => {
            const deliveriesAfterDeletion = prev.filter(d => !(d.date === selectedDate && customerIdsToDelete.includes(d.customerId)));
            // Explicit typing for Map to avoid inference errors
            const updatedDeliveriesMap = new Map<string, Delivery>(deliveriesAfterDeletion.map(d => [`${d.customerId}-${d.date}`, d] as [string, Delivery]));
            if (upsertResult.data) { (upsertResult.data as Delivery[]).forEach(d => { updatedDeliveriesMap.set(`${d.customerId}-${d.date}`, d); }); }
            return Array.from(updatedDeliveriesMap.values());
        });
        setPendingChanges(new Map());
        alert(`Successfully saved ${changesToProcess.size} changes for ${selectedDate}.`);
    } catch (error: any) {
        alert(`Error saving deliveries: ${getFriendlyErrorMessage(error)}`);
    } finally {
        setIsSaving(false);
    }
  };

  const handleSetAllDefaults = () => {
    const newChanges = new Map(pendingChanges);
    let changesMade = 0;
    activeCustomers.forEach(customer => {
        const hasPendingChange = newChanges.has(customer.id);
        const hasExistingDelivery = deliveriesForDate.has(customer.id);
        if (!hasPendingChange && !hasExistingDelivery) {
            newChanges.set(customer.id, customer.defaultQuantity);
            changesMade++;
        }
    });
    if (changesMade > 0) {
        setPendingChanges(newChanges);
        alert(`${changesMade} customers have been set to their default quantity. Click 'Save Changes' to confirm.`);
    } else {
        alert("All active customers already have a delivery entry for this date or have pending changes.");
    }
  };

  // --- Monthly Mode Logic ---
  const { datesOfMonth, monthStartDay } = useMemo(() => {
    if (!selectedMonth) return { datesOfMonth: [], monthStartDay: 0 };
    const [year, month] = selectedMonth.split('-').map(Number);
    const daysInMonth = new Date(year, month, 0).getDate();
    const monthStartDay = new Date(Date.UTC(year, month - 1, 1)).getUTCDay(); 
    const dates = Array.from({ length: daysInMonth }, (_, i) => `${year}-${String(month).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`);
    return { datesOfMonth: dates, monthStartDay };
  }, [selectedMonth]);

  const customerDeliveriesForMonth = useMemo(() => {
    if (!selectedMonthlyCustomer || !selectedMonth) return new Map<string, number>();
    const deliveryMap = new Map<string, number>();
    deliveries.forEach(d => {
        if (d.customerId === selectedMonthlyCustomer && d.date.startsWith(selectedMonth)) {
            deliveryMap.set(d.date, d.quantity);
        }
    });
    return deliveryMap;
  }, [deliveries, selectedMonthlyCustomer, selectedMonth]);

  const getMonthlyDisplayQuantity = (date: string): number | string => {
    if (monthlyPendingChanges.has(date)) {
        const value = monthlyPendingChanges.get(date);
        return value === 0 ? '' : value!;
    }
    return customerDeliveriesForMonth.get(date)?.toString() ?? '';
  };
  
  const handleMonthlyQuantityChange = (date: string, newQuantityStr: string) => {
    if (!/^[0-9]*\.?[0-9]*$/.test(newQuantityStr)) return;
    const newQuantity = newQuantityStr === '' ? 0 : parseFloat(newQuantityStr);
    if (isNaN(newQuantity) || newQuantity < 0) return;
    setMonthlyPendingChanges(prev => new Map<string, number>(prev).set(date, newQuantity));
  };
  
  const handleSetMonthToDefault = () => {
    const customer = customers.find(c => c.id === selectedMonthlyCustomer);
    if (!customer || !selectedMonth) return;
    const newChanges = new Map(monthlyPendingChanges);
    let changesMade = 0;
    datesOfMonth.forEach(date => {
        const hasDelivery = customerDeliveriesForMonth.has(date);
        const hasPendingChange = newChanges.has(date);
        if (!hasDelivery && !hasPendingChange) {
            newChanges.set(date, customer.defaultQuantity);
            changesMade++;
        }
    });
    if (changesMade > 0) {
      setMonthlyPendingChanges(newChanges);
      alert(`${changesMade} days have been set to the default quantity. Click 'Save Changes' to confirm.`);
    } else {
      alert("All days for this month already have a delivery or a pending change.");
    }
  };
  
  const handleSaveMonthlyChanges = async () => {
    if (!selectedMonthlyCustomer || monthlyPendingChanges.size === 0) {
        alert("No changes to save.");
        return;
    }
    setIsSaving(true);
    try {
        const changes = Array.from(monthlyPendingChanges.entries());
        const deliveriesToUpsert = changes.filter(([, quantity]) => quantity > 0).map(([date, quantity]) => ({ customerId: selectedMonthlyCustomer, date, quantity }));
        const datesToDelete = changes.filter(([, quantity]) => quantity === 0).map(([date]) => date).filter(date => customerDeliveriesForMonth.has(date));

        const upsertPromise = deliveriesToUpsert.length > 0 ? supabase.from('deliveries').upsert(deliveriesToUpsert, { onConflict: 'customerId,date' }).select() : Promise.resolve({ data: [], error: null });
        const deletePromise = datesToDelete.length > 0 ? supabase.from('deliveries').delete().eq('customerId', selectedMonthlyCustomer).in('date', datesToDelete) : Promise.resolve({ error: null });
        const [upsertResult, deleteResult] = await Promise.all([upsertPromise, deletePromise]);

        if (upsertResult.error) throw upsertResult.error;
        if (deleteResult.error) throw deleteResult.error;
        
        setDeliveries(prev => {
            const deliveriesAfterDeletion = prev.filter(d => !(d.customerId === selectedMonthlyCustomer && datesToDelete.includes(d.date)));
            const updatedDeliveriesMap = new Map<string, Delivery>(deliveriesAfterDeletion.map(d => [`${d.customerId}-${d.date}`, d] as [string, Delivery]));
            if (upsertResult.data) { (upsertResult.data as Delivery[]).forEach(d => { updatedDeliveriesMap.set(`${d.customerId}-${d.date}`, d); }); }
            return Array.from(updatedDeliveriesMap.values());
        });
        setMonthlyPendingChanges(new Map());
        alert(`Successfully saved ${changes.length} changes for the month.`);
    } catch (error: any) {
        alert(`Error saving monthly deliveries: ${getFriendlyErrorMessage(error)}`);
    } finally {
        setIsSaving(false);
    }
  };

  // --- Import/Export Logic ---
  const handleDownloadTemplate = (month: string) => {
    if (!month) {
        alert("Please select a month first.");
        return;
    }

    const [year, monthNum] = month.split('-').map(Number);
    const daysInMonth = new Date(year, monthNum, 0).getDate();
    const headers = ['Customer Name', ...Array.from({ length: daysInMonth }, (_, i) => String(i + 1))];

    const rows = activeCustomers.map(customer => {
        const row = [customer.name];
        for (let i = 0; i < daysInMonth; i++) {
            row.push(String(customer.defaultQuantity));
        }
        return row.join(',');
    });

    const csvContent = [headers.join(','), ...rows].join('\n');
    downloadCSV(csvContent, `delivery_template_${month}.csv`);
  };

  const handleFileImport = async (event: React.ChangeEvent<HTMLInputElement>, month: string) => {
    const file = event.target.files?.[0];
    if (!file || !month) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const fileContent = e.target?.result;
            if (typeof fileContent !== 'string') {
              alert('Error reading file content or file is empty.');
              return;
            }
            const text = fileContent;

            const rows = text.split('\n').filter(row => row.trim() !== '');
            if (rows.length < 2) throw new Error("CSV is empty or has only a header.");

            const header = rows[0].split(',').map(h => h.trim());
            const customerNameHeader = header[0];
            if (customerNameHeader.toLowerCase() !== 'customer name') {
                throw new Error("Invalid template. First column must be 'Customer Name'.");
            }
            
            // Explicitly type the Map to Map<string, string>
            const customerMapByName = new Map<string, string>(customers.map(c => [c.name.toLowerCase(), c.id] as [string, string]));
            const deliveriesToUpsert: Omit<Delivery, 'id' | 'userId'>[] = [];
            const notFoundCustomers = new Set<string>();
            const [year, monthStr] = month.split('-');

            for (let i = 1; i < rows.length; i++) {
                const values = rows[i].split(',');
                const customerName = values[0].trim();
                const customerId = customerMapByName.get(customerName.toLowerCase());

                if (!customerId) {
                    notFoundCustomers.add(customerName);
                    continue;
                }

                for (let dayIndex = 1; dayIndex < header.length; dayIndex++) {
                    const day = parseInt(header[dayIndex], 10);
                    const quantityStr = values[dayIndex]?.trim();
                    if (!isNaN(day) && quantityStr) {
                        const quantity = parseFloat(quantityStr);
                        if (!isNaN(quantity) && quantity > 0) {
                            const date = `${year}-${monthStr}-${String(day).padStart(2, '0')}`;
                            deliveriesToUpsert.push({ customerId, date, quantity });
                        }
                    }
                }
            }

            if (deliveriesToUpsert.length === 0) {
                alert("No valid delivery data found to import.");
                return;
            }

            const { data, error } = await supabase
                .from('deliveries')
                .upsert(deliveriesToUpsert, { onConflict: 'customerId,date' })
                .select();
            
            if (error) throw error;
            
            if (data) {
                setDeliveries(prev => {
                    const updatedMap = new Map<string, Delivery>(prev.map(d => [`${d.customerId}-${d.date}`, d] as [string, Delivery]));
                    (data as Delivery[]).forEach(d => updatedMap.set(`${d.customerId}-${d.date}`, d));
                    return Array.from(updatedMap.values());
                });
            }

            let alertMessage = `${data?.length || 0} delivery records imported/updated for ${month}.`;
            if (notFoundCustomers.size > 0) {
                alertMessage += `\n\nCould not find the following customers (they were skipped):\n- ${Array.from(notFoundCustomers).join('\n- ')}`;
            }
            alert(alertMessage);
            setIsImportModalOpen(false);
        } catch (error: any) {
             alert(`Error importing file: ${getFriendlyErrorMessage(error)}`);
        } finally {
            if (event.target) {
                event.target.value = '';
            }
        }
    };
    reader.readAsText(file);
  };
  
  const handleExport = () => {
    const customerMap = new Map<string, string>();
    customers.forEach(c => customerMap.set(c.id, c.name));

    const headers = ['customerName', 'date', 'quantity'];
    const rows = deliveries.map(d => {
        const customerName = customerMap.get(d.customerId) || 'Unknown Customer';
        return `${customerName},${d.date},${d.quantity}`;
    });
    
    const csvContent = [headers.join(','), ...rows].join('\n');
    downloadCSV(csvContent, 'all_deliveries.csv');
  };
  
  const totalPendingChanges = mode === 'daily' ? pendingChanges.size : monthlyPendingChanges.size;
  const saveButtonText = isSaving ? 'Saving...' : `Save Changes ${totalPendingChanges > 0 ? `(${totalPendingChanges})` : ''}`;

  return (
    <div>
      <div className="flex flex-col md:flex-row justify-between md:items-center mb-6 gap-4">
        <h2 className="text-3xl font-bold text-gray-800">Manage Deliveries</h2>
        <div className="flex items-center gap-2">
            <button onClick={() => setIsImportModalOpen(true)} className="flex items-center px-4 py-2 text-sm bg-blue-600 text-white rounded-lg shadow-sm hover:bg-blue-700 transition-colors">
                <UploadIcon className="h-4 w-4 mr-2"/> Bulk Import from CSV
            </button>
            <button onClick={handleExport} className="flex items-center px-4 py-2 text-sm bg-gray-600 text-white rounded-lg shadow-sm hover:bg-gray-700 transition-colors">
                <DownloadIcon className="h-4 w-4 mr-2"/> Export All Deliveries
            </button>
        </div>
      </div>
      
      <div className="flex justify-center mb-6">
        <div className="flex items-center p-1 bg-gray-200 rounded-lg">
          <button onClick={() => setMode('daily')} className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${mode === 'daily' ? 'bg-white text-blue-600 shadow' : 'text-gray-600'}`}>Daily View</button>
          <button onClick={() => setMode('monthly')} className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${mode === 'monthly' ? 'bg-white text-blue-600 shadow' : 'text-gray-600'}`}>Single Customer (Monthly)</button>
        </div>
      </div>

      {/* View-specific controls */}
      <div className="bg-white p-4 rounded-lg shadow-sm mb-6">
        {mode === 'daily' ? (
          <div className="flex items-center flex-wrap gap-4 justify-between">
            <div className="flex items-center gap-2">
              <label htmlFor="delivery-date" className="text-sm font-medium text-gray-700">Date:</label>
              <input id="delivery-date" type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500" />
            </div>
            <div className="relative">
              <input type="text" placeholder="Search customers..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="border border-gray-300 rounded-lg shadow-sm py-2 px-3 pl-10 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm" />
              <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
            </div>
            <div className="flex items-center border border-gray-300 rounded-md">
              <button onClick={() => setViewMode('grid')} className={`p-2 rounded-l-md transition-colors ${viewMode === 'grid' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-100'}`} aria-label="Grid view"><GridIcon className="h-5 w-5" /></button>
              <button onClick={() => setViewMode('list')} className={`p-2 rounded-r-md transition-colors ${viewMode === 'list' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-100'}`} aria-label="List view"><ListIcon className="h-5 w-5" /></button>
            </div>
            <button onClick={handleSetAllDefaults} className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg shadow-sm hover:bg-green-700">Set Defaults</button>
          </div>
        ) : (
          <div className="flex items-center flex-wrap gap-4 justify-between">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-700">Customer:</label>
              <select value={selectedMonthlyCustomer} onChange={e => setSelectedMonthlyCustomer(e.target.value)} className="border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500">
                <option value="">-- Select Customer --</option>
                {activeCustomers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-700">Month:</label>
              <input type="month" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} className="border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500" />
            </div>
             {selectedMonthlyCustomer && <button onClick={handleSetMonthToDefault} className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg shadow-sm hover:bg-green-700">Set Month to Default</button>}
          </div>
        )}
      </div>
      
      {/* Main Content Area */}
      <div className="pb-24">
        {mode === 'daily' ? (
          filteredActiveCustomers.length > 0 ? (
            viewMode === 'grid' ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {filteredActiveCustomers.map(customer => (
                  <div key={customer.id} className="bg-white shadow-md rounded-lg p-4">
                    <h3 className="font-bold text-lg text-gray-800">{customer.name}</h3>
                    <p className="text-sm text-gray-500 truncate">{customer.address}</p>
                    <div className="mt-4 flex items-center justify-between">
                      <label htmlFor={`quantity-grid-${customer.id}`} className="text-sm font-medium text-gray-700">Qty (L):</label>
                      <QuantityInput
                        id={`quantity-grid-${customer.id}`}
                        value={getDisplayQuantity(customer.id)}
                        onChange={(newValue) => handleQuantityChange(customer.id, newValue)}
                        placeholder={String(customer.defaultQuantity)}
                        inputClassName="w-20"
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-white shadow-md rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="text-xs text-gray-700 uppercase bg-gray-50"><tr><th className="px-6 py-3">Name</th><th className="px-6 py-3 hidden sm:table-cell">Address</th><th className="px-6 py-3 text-right">Quantity (L)</th></tr></thead>
                  <tbody>
                    {filteredActiveCustomers.map(customer => (
                      <tr key={customer.id} className="bg-white border-b hover:bg-gray-50">
                        <th className="px-6 py-4 font-medium text-gray-900 whitespace-nowrap">{customer.name}</th>
                        <td className="px-6 py-4 hidden sm:table-cell">{customer.address}</td>
                        <td className="px-6 py-4 text-right">
                           <QuantityInput
                            value={getDisplayQuantity(customer.id)}
                            onChange={(newValue) => handleQuantityChange(customer.id, newValue)}
                            placeholder={String(customer.defaultQuantity)}
                            inputClassName="w-20"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          ) : (
            <div className="text-center py-12 px-6 bg-white rounded-lg shadow-md">
              <h3 className="text-lg font-medium text-gray-700">No Customers Match Your Search</h3>
              <p className="mt-1 text-sm text-gray-500">Try a different name.</p>
            </div>
          )
        ) : (
            selectedMonthlyCustomer ? (
                <div className="bg-white shadow-md rounded-lg overflow-hidden p-6">
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
                        {datesOfMonth.map((date) => {
                             const day = new Date(date + 'T00:00:00Z').getUTCDate();
                             const qty = getMonthlyDisplayQuantity(date);
                             return (
                                 <div key={date} className="border rounded-md p-2 flex flex-col items-center">
                                     <span className="text-xs font-semibold text-gray-500 mb-1">{new Date(date + 'T00:00:00Z').toLocaleDateString('en-US', { weekday: 'short' })} {day}</span>
                                     <input
                                        type="text"
                                        value={qty}
                                        onChange={(e) => handleMonthlyQuantityChange(date, e.target.value)}
                                        className="w-full text-center border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                                        placeholder="-"
                                     />
                                 </div>
                             )
                        })}
                    </div>
                     <div className="mt-6 flex justify-end">
                        <button
                            onClick={handleSaveMonthlyChanges}
                            disabled={isSaving}
                            className="px-6 py-2 text-sm font-semibold bg-blue-600 text-white rounded-lg shadow-sm hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isSaving ? 'Saving...' : 'Save Monthly Changes'}
                        </button>
                    </div>
                </div>
            ) : (
                 <div className="text-center py-12 px-6 bg-white rounded-lg shadow-md">
                    <h3 className="text-lg font-medium text-gray-700">Select a Customer</h3>
                    <p className="mt-1 text-sm text-gray-500">Please select a customer to view their monthly calendar.</p>
                </div>
            )
        )}
      </div>

      {mode === 'daily' && pendingChanges.size > 0 && (
        <div className="fixed bottom-0 right-0 left-0 lg:left-64 bg-white/90 backdrop-blur-sm border-t border-gray-200 z-40 shadow-lg">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
                <div className="flex justify-between items-center">
                    <span className="text-gray-700 font-medium">
                        You have {pendingChanges.size} unsaved change{pendingChanges.size > 1 ? 's' : ''}.
                    </span>
                    <button onClick={handleSave} disabled={isSaving} className="px-6 py-2 text-sm font-semibold bg-blue-600 text-white rounded-lg shadow-sm hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                        {saveButtonText}
                    </button>
                </div>
            </div>
        </div>
      )}

      <BulkImportModal 
        isOpen={isImportModalOpen} 
        onClose={() => setIsImportModalOpen(false)}
        onDownloadTemplate={handleDownloadTemplate}
        onFileImport={handleFileImport}
      />
    </div>
  );
};

export default DeliveryManager;
