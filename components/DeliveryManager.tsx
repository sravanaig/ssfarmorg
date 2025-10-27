import React, { useState, useMemo, useRef, useEffect } from 'react';
import type { Customer, Delivery } from '../types';
import { UploadIcon, DownloadIcon, GridIcon, ListIcon, SearchIcon } from './Icons';
import { supabase } from '../lib/supabaseClient';

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
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [isSaving, setIsSaving] = useState(false);
  const [pendingChanges, setPendingChanges] = useState<Map<string, number>>(new Map());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [searchTerm, setSearchTerm] = useState('');

  const activeCustomers = useMemo(() => customers.filter(c => c.status === 'active'), [customers]);

  const filteredActiveCustomers = useMemo(() => {
    if (!searchTerm.trim()) {
      return activeCustomers;
    }
    const lowercasedFilter = searchTerm.toLowerCase();
    return activeCustomers.filter(customer =>
      customer.name.toLowerCase().includes(lowercasedFilter)
    );
  }, [activeCustomers, searchTerm]);

  useEffect(() => {
    // Clear pending changes when the date is changed
    setPendingChanges(new Map());
  }, [selectedDate]);

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
    
    // An empty string in the input should be treated as 0
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
        return value === 0 ? '' : value!; // Show empty string for 0 for better UX
    }

    const deliveryQty = deliveriesForDate.get(customerId);
    if(deliveryQty !== undefined) return deliveryQty;

    const customer = customers.find(c => c.id === customerId);
    return customer ? customer.defaultQuantity : 0;
  }
  
  const handleSave = async () => {
    setIsSaving(true);
    try {
        // Determine the final state for all active customers based on the UI
        const changesToProcess = new Map<string, number>();
        activeCustomers.forEach(customer => {
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

        const changes = Array.from(changesToProcess.entries());
        
        const deliveriesToUpsert = changes
            .filter(([, quantity]) => quantity > 0)
            .map(([customerId, quantity]) => ({
                customerId,
                date: selectedDate,
                quantity,
            }));

        const customerIdsToDelete = changes
            .filter(([, quantity]) => quantity === 0)
            .map(([customerId]) => customerId)
            .filter(id => deliveriesForDate.has(id)); // Only delete if it exists

        const upsertPromise = deliveriesToUpsert.length > 0
            ? supabase.from('deliveries').upsert(deliveriesToUpsert, { onConflict: 'customerId,date' }).select()
            : Promise.resolve({ data: [], error: null });
            
        const deletePromise = customerIdsToDelete.length > 0
            ? supabase.from('deliveries').delete().eq('date', selectedDate).in('customerId', customerIdsToDelete)
            : Promise.resolve({ error: null });

        const [upsertResult, deleteResult] = await Promise.all([upsertPromise, deletePromise]);

        if (upsertResult.error) throw upsertResult.error;
        if (deleteResult.error) throw deleteResult.error;
        
        setDeliveries(prev => {
            const deliveriesAfterDeletion = prev.filter(d => 
                !(d.date === selectedDate && customerIdsToDelete.includes(d.customerId))
            );

            const updatedDeliveriesMap = new Map(
                deliveriesAfterDeletion.map(d => [`${d.customerId}-${d.date}`, d])
            );
            
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
        alert(`Error saving deliveries: ${error.message}`);
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


  const handleExport = () => {
    const customerMap = new Map(customers.map(c => [c.id, c.name]));
    const headers = ['customerName', 'date', 'quantity'];
    const csvRows = [
        headers.join(','),
        ...deliveries.map(d => [
            customerMap.get(d.customerId) || 'Unknown Customer',
            d.date,
            d.quantity
        ].join(','))
    ];
    downloadCSV(csvRows.join('\n'), 'deliveries.csv');
  };
  
  const handleDownloadTemplate = () => {
    const content = 'customerName,date,quantity\nJohn Doe,2024-07-25,1.5';
    downloadCSV(content, 'delivery_template.csv');
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            // Fix: Cast FileReader result to string since we use `readAsText`, and check for null/empty content.
            const text = e.target?.result as string;
            if (!text) {
                alert('Error reading file content or file is empty.');
                return;
            }
            const rows = text.split('\n').filter(row => row.trim() !== '');
            if (rows.length < 2) {
                alert("CSV file is empty or contains only a header.");
                return;
            }

            const header = rows[0].split(',').map(h => h.trim());
            const requiredHeaders = ['customerName', 'date', 'quantity'];
            if (!requiredHeaders.every(h => header.includes(h))) {
                alert(`Invalid CSV header. Required headers are: ${requiredHeaders.join(', ')}`);
                return;
            }
            
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
                    if (!isNaN(quantity)) {
                       deliveriesToUpsert.push({
                            customerId,
                            date,
                            quantity,
                        });
                    }
                } else {
                    notFoundCustomers.add(customerName);
                }
            });

            if (deliveriesToUpsert.length > 0) {
                 const { data, error } = await supabase
                    .from('deliveries')
                    .upsert(deliveriesToUpsert, { onConflict: 'customerId,date' })
                    .select();

                if (error) throw error;
                if (data) {
                    setDeliveries(prev => {
                        const updatedDeliveriesMap = new Map(prev.map(d => [`${d.customerId}-${d.date}`, d]));
                        (data as Delivery[]).forEach((d) => {
                            updatedDeliveriesMap.set(`${d.customerId}-${d.date}`, d);
                        });
                        return Array.from(updatedDeliveriesMap.values());
                    });
                }
            }
            

            let alertMessage = `${deliveriesToUpsert.length} delivery records processed.`;
            if (notFoundCustomers.size > 0) {
                alertMessage += `\nCould not find the following customers: ${Array.from(notFoundCustomers).join(', ')}`;
            }
            alert(alertMessage);

        } catch (error: any) {
            alert("An error occurred while importing the file. " + error.message);
            console.error(error);
        } finally {
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
        }
    };
    reader.readAsText(file);
  };
  
  const saveButtonText = isSaving 
    ? 'Saving...' 
    : `Save Changes ${pendingChanges.size > 0 ? `(${pendingChanges.size})` : ''}`;

  return (
    <div>
      <div className="flex flex-col md:flex-row justify-between md:items-center mb-6 gap-4">
        <h2 className="text-3xl font-bold text-gray-800">Daily Deliveries</h2>
        <div className="flex items-center flex-wrap gap-4">
            <div className="flex items-center gap-2">
                <label htmlFor="delivery-date" className="text-sm font-medium text-gray-700 whitespace-nowrap">
                    Filter by Date:
                </label>
                <input
                    id="delivery-date"
                    type="date"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                />
            </div>
            <button onClick={handleSetAllDefaults} className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg shadow-sm hover:bg-green-700 transition-colors">
                Set Defaults for All
            </button>
             <button onClick={handleSave} disabled={isSaving} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg shadow-sm hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                {isSaving ? 'Saving...' : 'Save Changes'}
            </button>
            <div className="relative">
                <input
                    type="text"
                    placeholder="Search customers..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="border border-gray-300 rounded-lg shadow-sm py-2 px-3 pl-10 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                />
                <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
            </div>
            <div className="flex items-center border border-gray-300 rounded-md">
                <button 
                  onClick={() => setViewMode('grid')} 
                  className={`p-2 rounded-l-md transition-colors ${viewMode === 'grid' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-100'}`}
                  aria-label="Grid view"
                >
                  <GridIcon className="h-5 w-5" />
                </button>
                <button 
                  onClick={() => setViewMode('list')} 
                  className={`p-2 rounded-r-md transition-colors ${viewMode === 'list' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-100'}`}
                  aria-label="List view"
                >
                  <ListIcon className="h-5 w-5" />
                </button>
            </div>
        </div>
      </div>
      <div className="flex items-center flex-wrap gap-2 mb-6">
            <input type="file" accept=".csv" ref={fileInputRef} onChange={handleFileImport} className="hidden" />
            <button onClick={handleImportClick} className="flex items-center px-3 py-2 text-sm bg-gray-600 text-white rounded-lg shadow-sm hover:bg-gray-700 transition-colors">
                <UploadIcon className="h-4 w-4 mr-2"/> Import
            </button>
            <button onClick={handleExport} disabled={deliveries.length === 0} className="flex items-center px-3 py-2 text-sm bg-gray-600 text-white rounded-lg shadow-sm hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                <DownloadIcon className="h-4 w-4 mr-2"/> Export
            </button>
            <button onClick={handleDownloadTemplate} className="flex items-center px-3 py-2 text-sm text-gray-600 border rounded-lg hover:bg-gray-100 transition-colors">
                Template
            </button>
        </div>
      
      {activeCustomers.length > 0 ? (
        filteredActiveCustomers.length > 0 ? (
        <div className="pb-24">
          {viewMode === 'grid' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {filteredActiveCustomers.map(customer => {
                    const quantity = getDisplayQuantity(customer.id);
                    return (
                        <div key={customer.id} className="bg-white shadow-md rounded-lg p-4 flex flex-col justify-between">
                            <div>
                                <h3 className="font-bold text-lg text-gray-800">{customer.name}</h3>
                                <p className="text-sm text-gray-500">{customer.address}</p>
                            </div>
                            <div className="mt-4 flex items-center justify-between">
                                <label htmlFor={`quantity-grid-${customer.id}`} className="text-sm font-medium text-gray-700">Quantity (L):</label>
                                <input
                                    id={`quantity-grid-${customer.id}`}
                                    type="number"
                                    step="0.5"
                                    min="0"
                                    placeholder={String(customer.defaultQuantity)}
                                    value={quantity}
                                    onChange={(e) => handleQuantityChange(customer.id, e.target.value)}
                                    className="w-24 border border-gray-300 rounded-md shadow-sm py-1 px-2 text-center focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                                />
                            </div>
                        </div>
                    );
                })}
            </div>
          ) : (
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
                                            <label htmlFor={`quantity-list-${customer.id}`} className="sr-only">Quantity for {customer.name}</label>
                                            <input
                                                id={`quantity-list-${customer.id}`}
                                                type="number"
                                                step="0.5"
                                                min="0"
                                                placeholder={String(customer.defaultQuantity)}
                                                value={quantity}
                                                onChange={(e) => handleQuantityChange(customer.id, e.target.value)}
                                                className="w-24 border border-gray-300 rounded-md shadow-sm py-1 px-2 text-center focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                                            />
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
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
            <p className="mt-1 text-sm text-gray-500">Please add customers or mark them as active to track deliveries.</p>
        </div>
      )}

      {pendingChanges.size > 0 && (
        <div className="fixed bottom-0 right-0 left-0 lg:left-64 bg-white/90 backdrop-blur-sm border-t border-gray-200 z-40 shadow-lg">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
                <div className="flex justify-between items-center">
                    <span className="text-gray-700 font-medium">
                        You have {pendingChanges.size} unsaved change{pendingChanges.size > 1 ? 's' : ''}.
                    </span>
                    <button 
                        onClick={handleSave} 
                        disabled={isSaving} 
                        className="px-6 py-2 text-sm font-semibold bg-blue-600 text-white rounded-lg shadow-sm hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
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