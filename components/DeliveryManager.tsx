import React, { useState, useMemo, useRef, useEffect } from 'react';
import type { Customer, Delivery } from '../types';
import { UploadIcon, DownloadIcon, GridIcon, ListIcon, SearchIcon } from './Icons';
import { supabase } from '../lib/supabaseClient';
import { getFriendlyErrorMessage } from '../lib/errorHandler';
import QuantityInput from './QuantityInput';

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

const DeliveryManager: React.FC<DeliveryManagerProps> = ({ customers, deliveries, setDeliveries }) => {
  // Common state
  const [isSaving, setIsSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [searchTerm, setSearchTerm] = useState('');
  
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
        setPendingChanges(prev => new Map(prev).set(customerId, 0));
        return;
    }
    if (isNaN(newQuantity) || newQuantity < 0) return;
    setPendingChanges(prev => new Map(prev).set(customerId, newQuantity));
  };
  
  const getDisplayQuantity = (customerId: string): number | string => {
    if (pendingChanges.has(customerId)) {
        const value = pendingChanges.get(customerId);
        return value === 0 ? '' : value!;
    }
    const deliveryQty = deliveriesForDate.get(customerId);
    if(deliveryQty !== undefined) return deliveryQty;
    const customer = customers.find(c => c.id === customerId);
    return customer ? customer.defaultQuantity : 0;
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
            const updatedDeliveriesMap = new Map(deliveriesAfterDeletion.map(d => [`${d.customerId}-${d.date}`, d]));
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
    setMonthlyPendingChanges(prev => new Map(prev).set(date, newQuantity));
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
            const updatedDeliveriesMap = new Map(deliveriesAfterDeletion.map(d => [`${d.customerId}-${d.date}`, d]));
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

  // --- Common Logic & Render ---
  const handleExport = () => {
    const customerMap = new Map(customers.map(c => [c.id, c.name]));
    const headers = ['customerName', 'date', 'quantity'];
    const csvRows = [headers.join(','), ...deliveries.map(d => [customerMap.get(d.customerId) || 'Unknown Customer', d.date, d.quantity].join(','))];
    downloadCSV(csvRows.join('\n'), 'deliveries.csv');
  };
  
  const handleDownloadTemplate = () => {
    const content = 'customerName,date,quantity\nJohn Doe,2024-07-25,1.5';
    downloadCSV(content, 'delivery_template.csv');
  };

  const handleImportClick = () => { fileInputRef.current?.click(); };

  const handleFileImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const text = e.target?.result;
            // Fix: The 'result' of a FileReader can be an ArrayBuffer or null.
            // A type guard is added to ensure `text` is a string before calling string methods on it.
            if (typeof text !== 'string') {
              alert('Error reading file content or file is empty.');
              return;
            }
            const rows = text.split('\n').filter(row => row.trim() !== '');
            if (rows.length < 2) { alert("CSV file is empty or contains only a header."); return; }
            const header = rows[0].split(',').map(h => h.trim());
            const requiredHeaders = ['customerName', 'date', 'quantity'];
            if (!requiredHeaders.every(h => header.includes(h))) { alert(`Invalid CSV header. Required headers are: ${requiredHeaders.join(', ')}`); return; }
            const customerMapByName = new Map(customers.map(c => [c.name.toLowerCase(), c.id]));
            const deliveriesToUpsert: Omit<Delivery, 'id' | 'userId'>[] = [];
            const notFoundCustomers = new Set<string>();
            rows.slice(1).forEach(row => {
                const values = row.split(',');
                const customerName = values[header.indexOf('customerName')].trim();
                const customerId = customerMapByName.get(customerName.toLowerCase());
                if (customerId) {
                    const date = values[header.indexOf('date')].trim();
                    const quantity = parseFloat(values[header.indexOf('quantity')]);
                    if (!isNaN(quantity)) { deliveriesToUpsert.push({ customerId, date, quantity }); }
                } else {
                    notFoundCustomers.add(customerName);
                }
            });
            if (deliveriesToUpsert.length > 0) {
                 const { data, error } = await supabase.from('deliveries').upsert(deliveriesToUpsert, { onConflict: 'customerId,date' }).select();
                if (error) throw error;
                if (data) {
                    setDeliveries(prev => {
                        const updatedDeliveriesMap = new Map(prev.map(d => [`${d.customerId}-${d.date}`, d]));
                        (data as Delivery[]).forEach((d) => { updatedDeliveriesMap.set(`${d.customerId}-${d.date}`, d); });
                        return Array.from(updatedDeliveriesMap.values());
                    });
                }
            }
            let alertMessage = `${deliveriesToUpsert.length} delivery records processed.`;
            if (notFoundCustomers.size > 0) { alertMessage += `\nCould not find the following customers: ${Array.from(notFoundCustomers).join(', ')}`; }
            alert(alertMessage);
        } catch (error: any) {
            alert("An error occurred while importing the file. " + getFriendlyErrorMessage(error));
        } finally {
            if (fileInputRef.current) { fileInputRef.current.value = ''; }
        }
    };
    reader.readAsText(file);
  };
  
  const totalPendingChanges = mode === 'daily' ? pendingChanges.size : monthlyPendingChanges.size;
  const saveButtonText = isSaving ? 'Saving...' : `Save Changes ${totalPendingChanges > 0 ? `(${totalPendingChanges})` : ''}`;

  return (
    <div>
      <div className="flex flex-col md:flex-row justify-between md:items-center mb-6 gap-4">
        <h2 className="text-3xl font-bold text-gray-800">Manage Deliveries</h2>
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
                        <th className="px-6 py-4 font-medium text-gray-900">{customer.name}</th>
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
            <div className="text-center py-12 px-6 bg-white rounded-lg shadow-md"><h3 className="text-lg font-medium text-gray-700">No Customers Found</h3><p className="mt-1 text-sm text-gray-500">No active customers match your search criteria.</p></div>
          )
        ) : (
          selectedMonthlyCustomer && selectedMonth ? (
            <div className="bg-white shadow-md rounded-lg p-4">
              <div className="grid grid-cols-7 gap-1 text-center font-semibold text-xs text-gray-500 mb-2">
                  <div>Sun</div><div>Mon</div><div>Tue</div><div>Wed</div><div>Thu</div><div>Fri</div><div>Sat</div>
              </div>
              <div className="grid grid-cols-7 gap-2">
                {Array.from({ length: monthStartDay }).map((_, i) => <div key={`empty-${i}`} />)}
                {datesOfMonth.map(date => {
                    const day = new Date(date + 'T00:00:00Z').getUTCDate();
                    const customer = customers.find(c => c.id === selectedMonthlyCustomer);
                    return (
                        <div key={date} className="p-2 border rounded-md bg-gray-50 flex flex-col">
                            <div className="text-sm font-bold text-gray-800 mb-1">{day}</div>
                            <div className="mt-auto">
                              <QuantityInput
                                value={getMonthlyDisplayQuantity(date)}
                                onChange={(newValue) => handleMonthlyQuantityChange(date, newValue)}
                                placeholder={customer?.defaultQuantity.toString()}
                                inputClassName="w-full"
                              />
                            </div>
                        </div>
                    );
                })}
              </div>
            </div>
          ) : (
            <div className="text-center py-12 px-6 bg-white rounded-lg shadow-md"><h3 className="text-lg font-medium text-gray-700">Select a Customer and Month</h3><p className="mt-1 text-sm text-gray-500">Choose a customer and a month above to view and edit their deliveries.</p></div>
          )
        )}
      </div>

      {totalPendingChanges > 0 && (
        <div className="fixed bottom-0 right-0 left-0 lg:left-64 bg-white/90 backdrop-blur-sm border-t border-gray-200 z-40 shadow-lg">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
                <div className="flex justify-between items-center">
                    <span className="text-gray-700 font-medium">You have {totalPendingChanges} unsaved change{totalPendingChanges > 1 ? 's' : ''}.</span>
                    <button onClick={mode === 'daily' ? handleSave : handleSaveMonthlyChanges} disabled={isSaving} className="px-6 py-2 text-sm font-semibold bg-blue-600 text-white rounded-lg shadow-sm hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                        {saveButtonText}
                    </button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};

export default DeliveryManager;