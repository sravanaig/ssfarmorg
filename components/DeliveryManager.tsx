
import React, { useState, useMemo, useRef, useEffect } from 'react';
import type { Customer, Delivery } from '../types';
import { UploadIcon, DownloadIcon, GridIcon, ListIcon, SearchIcon, TableIcon } from './Icons';
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

interface BulkExportModalProps {
    isOpen: boolean;
    onClose: () => void;
    onExport: (month: string) => void;
}

const BulkExportModal: React.FC<BulkExportModalProps> = ({ isOpen, onClose, onExport }) => {
    const [exportMonth, setExportMonth] = useState(new Date().toISOString().substring(0, 7));

    const handleExportClick = () => {
        if (!exportMonth) {
            alert("Please select a month.");
            return;
        }
        onExport(exportMonth);
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Bulk Export Deliveries">
            <div className="space-y-6">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Select Month to Export</label>
                    <p className="text-sm text-gray-600 mb-2">Download a monthly report of all deliveries for active customers.</p>
                    <input
                        type="month"
                        value={exportMonth}
                        onChange={e => setExportMonth(e.target.value)}
                        className="w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    />
                </div>
                <div className="flex justify-end pt-4 border-t space-x-2">
                    <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300">Cancel</button>
                    <button
                        onClick={handleExportClick}
                        className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                    >
                        <DownloadIcon className="h-4 w-4 mr-2"/> Export CSV
                    </button>
                </div>
            </div>
        </Modal>
    );
};

const DeliveryManager: React.FC<DeliveryManagerProps> = ({ customers, deliveries, setDeliveries }) => {
  // Common state
  const [isSaving, setIsSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  
  // View mode state
  const [mode, setMode] = useState<'daily' | 'monthly' | 'spreadsheet'>('spreadsheet');

  // Daily mode state
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [pendingChanges, setPendingChanges] = useState<Map<string, number>>(new Map());
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  // Monthly/Spreadsheet mode state
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
            const updatedDeliveriesMap = new Map<string, Delivery>(deliveriesAfterDeletion.map(d => [`${d.customerId}-${d.date}`, d]));
            
            if (upsertResult.data) { 
                (upsertResult.data as Delivery[]).forEach(d => { 
                    updatedDeliveriesMap.set(`${d.customerId}-${d.date}`, d); 
                }); 
            }
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
    const newChanges = new Map<string, number>(pendingChanges);
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

  // --- Spreadsheet & Monthly Mode Logic ---
  const { datesOfMonth, monthStartDay } = useMemo(() => {
    if (!selectedMonth) return { datesOfMonth: [], monthStartDay: 0 };
    const [year, month] = selectedMonth.split('-').map(Number);
    const daysInMonth = new Date(year, month, 0).getDate();
    const monthStartDay = new Date(Date.UTC(year, month - 1, 1)).getUTCDay(); 
    const dates = Array.from({ length: daysInMonth }, (_, i) => `${year}-${String(month).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`);
    return { datesOfMonth: dates, monthStartDay };
  }, [selectedMonth]);

  const customerDeliveriesForMonth = useMemo(() => {
    // For Spreadsheet mode, we need all deliveries for the month
    if (mode === 'spreadsheet') {
        const deliveryMap = new Map<string, number>();
        deliveries.forEach(d => {
            if (d.date.startsWith(selectedMonth)) {
                deliveryMap.set(`${d.customerId}-${d.date}`, d.quantity);
            }
        });
        return deliveryMap;
    }
    
    // For single customer Monthly mode
    if (!selectedMonthlyCustomer || !selectedMonth) return new Map<string, number>();
    const deliveryMap = new Map<string, number>();
    deliveries.forEach(d => {
        if (d.customerId === selectedMonthlyCustomer && d.date.startsWith(selectedMonth)) {
            deliveryMap.set(d.date, d.quantity);
        }
    });
    return deliveryMap;
  }, [deliveries, selectedMonthlyCustomer, selectedMonth, mode]);

  const getMonthlyDisplayQuantity = (date: string, customerId?: string): number | string => {
    const key = customerId ? `${customerId}-${date}` : date;
    if (monthlyPendingChanges.has(key)) {
        const value = monthlyPendingChanges.get(key);
        return value === 0 ? '' : value!;
    }
    
    if (mode === 'spreadsheet' && customerId) {
        return customerDeliveriesForMonth.get(`${customerId}-${date}`)?.toString() ?? '';
    }
    
    return customerDeliveriesForMonth.get(date)?.toString() ?? '';
  };
  
  const handleMonthlyQuantityChange = (date: string, newQuantityStr: string, customerId?: string) => {
    if (!/^[0-9]*\.?[0-9]*$/.test(newQuantityStr)) return;
    const newQuantity = newQuantityStr === '' ? 0 : parseFloat(newQuantityStr);
    if (isNaN(newQuantity) || newQuantity < 0) return;
    
    const key = customerId ? `${customerId}-${date}` : date;
    setMonthlyPendingChanges(prev => new Map<string, number>(prev).set(key, newQuantity));
  };
  
  const handleSetMonthToDefault = () => {
    const customer = customers.find(c => c.id === selectedMonthlyCustomer);
    if (!customer || !selectedMonth) return;
    const newChanges = new Map<string, number>(monthlyPendingChanges);
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
    const changesCount = monthlyPendingChanges.size;
    if (changesCount === 0) {
        alert("No changes to save.");
        return;
    }
    setIsSaving(true);
    try {
        const changes = Array.from(monthlyPendingChanges.entries());
        
        const deliveriesToUpsert = changes
            .filter(([, quantity]) => quantity > 0)
            .map(([key, quantity]) => {
                const [cid, date] = mode === 'spreadsheet' ? key.split(/(.+)-(\d{4}-\d{2}-\d{2})/).filter(Boolean) : [selectedMonthlyCustomer, key];
                return { customerId: cid, date, quantity };
            });

        const deletesToProcess = changes
            .filter(([, quantity]) => quantity === 0)
            .map(([key]) => {
                 const [cid, date] = mode === 'spreadsheet' ? key.split(/(.+)-(\d{4}-\d{2}-\d{2})/).filter(Boolean) : [selectedMonthlyCustomer, key];
                 return { customerId: cid, date };
            })
            .filter(item => {
                const key = mode === 'spreadsheet' ? `${item.customerId}-${item.date}` : item.date;
                return customerDeliveriesForMonth.has(key);
            });

        // Group deletes by customer for efficiency if many
        const upsertPromise = deliveriesToUpsert.length > 0 ? supabase.from('deliveries').upsert(deliveriesToUpsert, { onConflict: 'customerId,date' }).select() : Promise.resolve({ data: [], error: null });
        
        // Simple delete approach: one by one or in batches if same customer. 
        // For simplicity, we'll just do it sequentially or filter the main set.
        // A better approach for spreadsheet is batch delete by filter.
        let deleteError = null;
        if (deletesToProcess.length > 0) {
            for (const item of deletesToProcess) {
                const { error } = await supabase.from('deliveries').delete().eq('customerId', item.customerId).eq('date', item.date);
                if (error) deleteError = error;
            }
        }

        if (upsertPromise && (await upsertPromise).error) throw (await upsertPromise).error;
        if (deleteError) throw deleteError;
        
        const upsertResult = await upsertPromise;

        setDeliveries(prev => {
            let next = [...prev];
            // Remove deleted items
            deletesToProcess.forEach(item => {
                next = next.filter(d => !(d.customerId === item.customerId && d.date === item.date));
            });
            
            const updatedDeliveriesMap = new Map<string, Delivery>(next.map(d => [`${d.customerId}-${d.date}`, d]));

            if (upsertResult.data) { 
                (upsertResult.data as Delivery[]).forEach(d => { 
                    updatedDeliveriesMap.set(`${d.customerId}-${d.date}`, d); 
                }); 
            }
            return Array.from(updatedDeliveriesMap.values());
        });

        setMonthlyPendingChanges(new Map());
        alert(`Successfully saved ${changesCount} changes.`);
    } catch (error: any) {
        alert(`Error saving deliveries: ${getFriendlyErrorMessage(error)}`);
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

  const handleBulkExport = (month: string) => {
    const [year, monthNum] = month.split('-').map(Number);
    const daysInMonth = new Date(year, monthNum, 0).getDate();
    
    // Construct Header
    const headerRow = ['Customer Name', 'Mobile', 'Address'];
    for (let i = 1; i <= daysInMonth; i++) {
        headerRow.push(String(i));
    }
    headerRow.push('Total (L)');

    // Create a quick lookup map for deliveries in this month
    const monthPrefix = `${year}-${String(monthNum).padStart(2, '0')}`;
    const deliveriesMap = new Map<string, number>();
    deliveries.forEach(d => {
        if (d.date.startsWith(monthPrefix)) {
            deliveriesMap.set(`${d.customerId}-${d.date}`, d.quantity);
        }
    });

    // Construct Data Rows
    const rows = activeCustomers.map(customer => {
        const row = [
            `"${customer.name}"`, 
            `"${customer.phone || ''}"`,
            `"${customer.address.replace(/"/g, '""')}"` // Escape quotes in address
        ];
        
        let customerTotal = 0;
        for (let i = 1; i <= daysInMonth; i++) {
            const dateStr = `${monthPrefix}-${String(i).padStart(2, '0')}`;
            const key = `${customer.id}-${dateStr}`;
            const qty = deliveriesMap.get(key) || 0;
            customerTotal += qty;
            row.push(String(qty));
        }
        row.push(String(customerTotal));
        return row.join(',');
    });

    const csvContent = [headerRow.join(','), ...rows].join('\n');
    downloadCSV(csvContent, `monthly_deliveries_${month}.csv`);
    setIsExportModalOpen(false);
  };

  const handleFileImport = async (event: React.ChangeEvent<HTMLInputElement>, month: string) => {
    const file = event.target.files?.[0];
    const inputElement = event.target;
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
                const importedDeliveries = data as Delivery[];
                setDeliveries(prev => {
                    const deliveryMap = new Map<string, Delivery>(prev.map(d => [`${d.customerId}-${d.date}`, d]));
                    importedDeliveries.forEach(d => deliveryMap.set(`${d.customerId}-${d.date}`, d));
                    return Array.from(deliveryMap.values());
                });
                
                let msg = `${importedDeliveries.length} deliveries imported successfully.`;
                if (notFoundCustomers.size > 0) {
                    msg += `\n\nSkipped ${notFoundCustomers.size} unknown customers: ${Array.from(notFoundCustomers).slice(0, 5).join(', ')}${notFoundCustomers.size > 5 ? '...' : ''}`;
                }
                alert(msg);
                setIsImportModalOpen(false);
            }

        } catch (error: any) {
            alert("An error occurred while importing: " + getFriendlyErrorMessage(error));
        } finally {
             if (inputElement) {
                inputElement.value = '';
            }
        }
    };
    reader.readAsText(file);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex flex-col md:flex-row justify-between md:items-center mb-6 gap-4">
        <h2 className="text-3xl font-bold text-gray-800">Manage Deliveries</h2>
        <div className="flex items-center flex-wrap gap-2">
             <div className="bg-gray-100 p-1 rounded-lg flex">
                <button 
                    onClick={() => setMode('spreadsheet')}
                    className={`px-3 py-1.5 text-sm rounded-md transition-colors flex items-center ${mode === 'spreadsheet' ? 'bg-white shadow-sm text-blue-600 font-medium' : 'text-gray-600 hover:text-gray-800'}`}
                >
                    <TableIcon className="h-4 w-4 mr-1.5"/> Spreadsheet
                </button>
                <button 
                    onClick={() => setMode('daily')}
                    className={`px-3 py-1.5 text-sm rounded-md transition-colors ${mode === 'daily' ? 'bg-white shadow-sm text-blue-600 font-medium' : 'text-gray-600 hover:text-gray-800'}`}
                >
                    Daily
                </button>
                <button 
                    onClick={() => setMode('monthly')}
                    className={`px-3 py-1.5 text-sm rounded-md transition-colors ${mode === 'monthly' ? 'bg-white shadow-sm text-blue-600 font-medium' : 'text-gray-600 hover:text-gray-800'}`}
                >
                    Monthly
                </button>
            </div>
             <button onClick={() => setIsImportModalOpen(true)} className="flex items-center px-3 py-2 text-sm bg-gray-600 text-white rounded-lg shadow-sm hover:bg-gray-700 transition-colors">
                <UploadIcon className="h-4 w-4 mr-2"/> Bulk Import
            </button>
             <button onClick={() => setIsExportModalOpen(true)} className="flex items-center px-3 py-2 text-sm bg-blue-600 text-white rounded-lg shadow-sm hover:bg-blue-700 transition-colors">
                <DownloadIcon className="h-4 w-4 mr-2"/> Bulk Export
            </button>
        </div>
      </div>

      {mode === 'spreadsheet' && (
          <div className="flex flex-col flex-grow bg-white rounded-lg shadow-md overflow-hidden min-h-[600px]">
              <div className="p-4 border-b bg-gray-50 flex flex-col sm:flex-row justify-between items-center gap-4">
                  <div className="flex items-center gap-4">
                      <label className="text-sm font-medium text-gray-700">Month:</label>
                      <input
                          type="month"
                          value={selectedMonth}
                          onChange={e => setSelectedMonth(e.target.value)}
                          className="border border-gray-300 rounded-md shadow-sm py-1.5 px-3 focus:ring-blue-500 focus:border-blue-500 text-sm"
                      />
                  </div>
                  <div className="relative w-full sm:w-64">
                        <input
                            type="text"
                            placeholder="Search customers..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full border border-gray-300 rounded-lg shadow-sm py-1.5 px-3 pl-9 focus:ring-blue-500 focus:border-blue-500 text-sm"
                        />
                        <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  </div>
              </div>

              <div className="flex-grow overflow-auto relative">
                  <table className="w-full text-xs text-left border-collapse table-fixed">
                      <thead className="bg-gray-100 sticky top-0 z-20">
                          <tr>
                              <th className="sticky left-0 z-30 bg-gray-100 border p-2 w-48 shadow-[1px_0_0_0_#e5e7eb]">Customer Name</th>
                              {datesOfMonth.map(date => {
                                  const dayNum = date.split('-')[2];
                                  const isToday = date === new Date().toISOString().split('T')[0];
                                  return (
                                      <th key={date} className={`border p-1 w-10 text-center ${isToday ? 'bg-blue-200 text-blue-900 font-bold' : ''}`}>
                                          {dayNum}
                                      </th>
                                  );
                              })}
                          </tr>
                      </thead>
                      <tbody>
                          {filteredActiveCustomers.map(customer => (
                              <tr key={customer.id} className="hover:bg-blue-50 transition-colors">
                                  <td className="sticky left-0 z-10 bg-white border p-2 font-medium text-gray-900 truncate shadow-[1px_0_0_0_#e5e7eb]">
                                      {customer.name}
                                  </td>
                                  {datesOfMonth.map(date => {
                                      const val = getMonthlyDisplayQuantity(date, customer.id);
                                      const isToday = date === new Date().toISOString().split('T')[0];
                                      const isChanged = monthlyPendingChanges.has(`${customer.id}-${date}`);
                                      return (
                                          <td key={date} className={`border p-0 ${isToday ? 'bg-blue-50' : ''}`}>
                                              <input
                                                  type="text"
                                                  inputMode="decimal"
                                                  value={val}
                                                  placeholder={String(customer.defaultQuantity)}
                                                  onChange={(e) => handleMonthlyQuantityChange(date, e.target.value, customer.id)}
                                                  className={`w-full h-8 text-center bg-transparent focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 transition-colors ${isChanged ? 'bg-yellow-50 text-blue-700 font-bold' : ''} ${val === '0' || val === 0 ? 'text-gray-300' : ''}`}
                                              />
                                          </td>
                                      );
                                  })}
                              </tr>
                          ))}
                      </tbody>
                  </table>
              </div>
              
              <div className="p-4 border-t bg-gray-50 flex justify-between items-center">
                  <div className="text-sm text-gray-600">
                      {monthlyPendingChanges.size > 0 ? (
                          <span className="font-bold text-blue-600">{monthlyPendingChanges.size} unsaved changes</span>
                      ) : (
                          "All data is up to date."
                      )}
                  </div>
                  <button
                      onClick={handleSaveMonthlyChanges}
                      disabled={isSaving || monthlyPendingChanges.size === 0}
                      className="px-6 py-2 bg-blue-600 text-white rounded-lg font-semibold shadow hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                  >
                      {isSaving ? 'Saving...' : 'Save Spreadsheet Changes'}
                  </button>
              </div>
          </div>
      )}

      {mode === 'daily' && (
        <div>
            <div className="flex flex-col sm:flex-row justify-between items-center mb-4 gap-4 bg-white p-4 rounded-lg shadow-sm">
                 <div className="flex items-center gap-2 w-full sm:w-auto">
                    <label htmlFor="delivery-date" className="text-sm font-medium text-gray-700">Date:</label>
                    <input
                        id="delivery-date"
                        type="date"
                        value={selectedDate}
                        onChange={(e) => setSelectedDate(e.target.value)}
                        className="border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    />
                     <button onClick={handleSetAllDefaults} className="ml-2 px-3 py-2 text-sm bg-indigo-100 text-indigo-700 rounded-md hover:bg-indigo-200 transition-colors">
                        Set All Defaults
                    </button>
                </div>
                <div className="flex items-center gap-2 w-full sm:w-auto">
                    <div className="relative flex-grow sm:flex-grow-0">
                        <input
                            type="text"
                            placeholder="Search customers..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full border border-gray-300 rounded-lg shadow-sm py-2 px-3 pl-10 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                        />
                        <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                    </div>
                    <div className="flex bg-gray-100 rounded-lg p-1">
                        <button onClick={() => setViewMode('grid')} className={`p-2 rounded-md ${viewMode === 'grid' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-500'}`} title="Grid View"><GridIcon className="h-5 w-5"/></button>
                        <button onClick={() => setViewMode('list')} className={`p-2 rounded-md ${viewMode === 'list' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-500'}`} title="List View"><ListIcon className="h-5 w-5"/></button>
                    </div>
                </div>
            </div>
            
            {activeCustomers.length > 0 ? (
                filteredActiveCustomers.length > 0 ? (
                    <div className="pb-24">
                        {viewMode === 'list' ? (
                             <div className="bg-white shadow-md rounded-lg overflow-hidden">
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm text-left text-gray-500">
                                        <thead className="text-xs text-gray-700 uppercase bg-gray-50">
                                            <tr>
                                                <th scope="col" className="px-6 py-3">Name</th>
                                                <th scope="col" className="px-6 py-3 hidden sm:table-cell">Address</th>
                                                <th scope="col" className="px-6 py-3 text-right">Quantity (L)</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {filteredActiveCustomers.map(customer => {
                                                const quantity = getDisplayQuantity(customer.id);
                                                return (
                                                    <tr key={customer.id} className="bg-white border-b hover:bg-gray-50">
                                                        <th scope="row" className="px-6 py-4 font-medium text-gray-900 whitespace-nowrap">{customer.name}</th>
                                                        <td className="px-6 py-4 hidden sm:table-cell">{customer.address}</td>
                                                        <td className="px-6 py-4 text-right">
                                                             <QuantityInput
                                                                value={quantity}
                                                                onChange={(newValue) => handleQuantityChange(customer.id, newValue)}
                                                                placeholder={String(customer.defaultQuantity)}
                                                                inputClassName="w-20"
                                                            />
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                                {filteredActiveCustomers.map(customer => {
                                    const quantity = getDisplayQuantity(customer.id);
                                    return (
                                        <div key={customer.id} className="bg-white border rounded-lg shadow-sm p-4 flex flex-col justify-between">
                                            <div className="mb-4">
                                                <h3 className="font-bold text-gray-800 truncate" title={customer.name}>{customer.name}</h3>
                                                <p className="text-xs text-gray-500 truncate" title={customer.address}>{customer.address}</p>
                                            </div>
                                            <div className="flex justify-between items-center">
                                                <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-1 rounded">Default: {customer.defaultQuantity}L</span>
                                                <QuantityInput
                                                    value={quantity}
                                                    onChange={(newValue) => handleQuantityChange(customer.id, newValue)}
                                                    placeholder={String(customer.defaultQuantity)}
                                                    inputClassName="w-16"
                                                />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="text-center py-12 px-6 bg-white rounded-lg shadow-md">
                        <h3 className="text-lg font-medium text-gray-700">No Customers Match Your Search</h3>
                        <p className="mt-1 text-sm text-gray-500">Try a different name.</p>
                    </div>
                )
            ) : (
                 <div className="text-center py-12 px-6 bg-white rounded-lg shadow-md">
                    <h3 className="text-lg font-medium text-gray-700">No Active Customers Found</h3>
                    <p className="mt-1 text-sm text-gray-500">Please add customers or mark them as active to manage deliveries.</p>
                </div>
            )}

            {pendingChanges.size > 0 && (
                <div className="fixed bottom-0 right-0 left-0 lg:left-64 bg-white/90 backdrop-blur-sm border-t border-gray-200 z-40 shadow-lg">
                    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
                        <div className="flex justify-between items-center">
                            <span className="text-gray-700 font-medium">
                                You have {pendingChanges.size} unsaved change{pendingChanges.size > 1 ? 's' : ''}.
                            </span>
                            <button onClick={handleSave} disabled={isSaving} className="px-6 py-2 text-sm font-semibold bg-blue-600 text-white rounded-lg shadow-sm hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                                {isSaving ? 'Saving...' : 'Save Changes'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
      )}

      {mode === 'monthly' && (
        <div className="bg-white p-6 rounded-lg shadow-md">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Select Customer</label>
                    <select
                        className="w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                        value={selectedMonthlyCustomer}
                        onChange={e => setSelectedMonthlyCustomer(e.target.value)}
                    >
                        <option value="">-- Choose a customer --</option>
                        {activeCustomers.map(c => (
                            <option key={c.id} value={c.id}>{c.name} ({c.address})</option>
                        ))}
                    </select>
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Select Month</label>
                    <input
                        type="month"
                        value={selectedMonth}
                        onChange={e => setSelectedMonth(e.target.value)}
                        className="w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    />
                </div>
            </div>
            
            {selectedMonthlyCustomer ? (
                <div>
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="text-lg font-semibold text-gray-800">
                            Deliveries for {new Date(selectedMonth + '-02').toLocaleString('default', { month: 'long', year: 'numeric' })}
                        </h3>
                         <button onClick={handleSetAllDefaults} className="px-3 py-2 text-sm bg-indigo-100 text-indigo-700 rounded-md hover:bg-indigo-200 transition-colors">
                            Fill Defaults for Month
                        </button>
                    </div>
                    
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-2 mb-6">
                        {datesOfMonth.map(date => {
                            const quantity = getMonthlyDisplayQuantity(date);
                            const dayNum = parseInt(date.split('-')[2]);
                            const isToday = date === new Date().toISOString().split('T')[0];
                            
                            return (
                                <div key={date} className={`border rounded p-2 flex flex-col items-center ${isToday ? 'bg-blue-50 border-blue-200' : 'bg-white'}`}>
                                    <span className={`text-xs font-medium mb-1 ${isToday ? 'text-blue-700' : 'text-gray-500'}`}>
                                        {new Date(date + 'T00:00:00Z').toLocaleDateString('en-US', { weekday: 'short' })} {dayNum}
                                    </span>
                                    <QuantityInput
                                        value={quantity}
                                        onChange={(val) => handleMonthlyQuantityChange(date, val)}
                                        inputClassName="w-12 text-sm"
                                    />
                                </div>
                            );
                        })}
                    </div>
                    
                    <div className="flex justify-end border-t pt-4">
                        <button 
                            onClick={handleSaveMonthlyChanges} 
                            disabled={isSaving || monthlyPendingChanges.size === 0} 
                            className="px-6 py-2 bg-blue-600 text-white rounded-lg shadow-sm hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                             {isSaving ? 'Saving...' : `Save ${monthlyPendingChanges.size} Changes`}
                        </button>
                    </div>
                </div>
            ) : (
                <div className="text-center py-12 border-2 border-dashed border-gray-200 rounded-lg">
                    <p className="text-gray-500">Please select a customer to view and edit their monthly calendar.</p>
                </div>
            )}
        </div>
      )}
      
      <BulkImportModal 
        isOpen={isImportModalOpen} 
        onClose={() => setIsImportModalOpen(false)} 
        onDownloadTemplate={handleDownloadTemplate}
        onFileImport={handleFileImport}
      />
      <BulkExportModal 
        isOpen={isExportModalOpen} 
        onClose={() => setIsExportModalOpen(false)} 
        onExport={handleBulkExport}
      />
    </div>
  );
};

export default DeliveryManager;
