
import React, { useState, useMemo, useRef, useEffect } from 'react';
import type { Customer, Delivery } from '../types';
import { UploadIcon, DownloadIcon } from './Icons';
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
  const [pendingChanges, setPendingChanges] = useState<Map<number, number>>(new Map());
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Clear pending changes when the date is changed
    setPendingChanges(new Map());
  }, [selectedDate]);

  const deliveriesForDate = useMemo(() => {
    const deliveryMap = new Map<number, number>();
    deliveries.forEach(d => {
        if (d.date === selectedDate) {
            deliveryMap.set(d.customerId, d.quantity);
        }
    });
    return deliveryMap;
  }, [deliveries, selectedDate]);

  const handleQuantityChange = (customerId: number, newQuantityStr: string) => {
    const newQuantity = parseFloat(newQuantityStr);
    
    // An empty string in the input should be treated as 0
    if (newQuantityStr === '') {
        setPendingChanges(prev => new Map(prev).set(customerId, 0));
        return;
    }
    
    if (isNaN(newQuantity) || newQuantity < 0) return;
    setPendingChanges(prev => new Map(prev).set(customerId, newQuantity));
  };
  
  const getDisplayQuantity = (customerId: number): number | string => {
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
    if (pendingChanges.size === 0) {
        alert("No changes to save.");
        return;
    }

    setIsSaving(true);
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Not authenticated");

        const deliveriesToUpsert = Array.from(pendingChanges.entries()).map(([customerId, quantity]) => ({
            customerId,
            date: selectedDate,
            quantity,
            userId: user.id,
        }));

        const { data, error } = await supabase
            .from('deliveries')
            .upsert(deliveriesToUpsert, { onConflict: 'customerId,date' })
            .select();

        if (error) throw error;

        if (data) {
            setDeliveries(prev => {
                const newDeliveriesMap = new Map(
                    (data as Delivery[]).map(d => [`${d.customerId}-${d.date}`, d])
                );
                const otherDeliveries = prev.filter(d => !newDeliveriesMap.has(`${d.customerId}-${d.date}`));
                return [...otherDeliveries, ...(data as Delivery[])];
            });
            setPendingChanges(new Map());
        }
    } catch (error: any) {
        alert(`Error saving deliveries: ${error.message}`);
    } finally {
        setIsSaving(false);
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
            const text = e.target?.result;
            if (typeof text !== 'string') {
                alert('Error reading file content.');
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
            
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error("Not authenticated");

            const customerMapByName = new Map(customers.map(c => [c.name.toLowerCase(), c.id]));
            const deliveriesToUpsert: Omit<Delivery, 'id'>[] = [];
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
                            userId: user.id,
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
                        const updatedDeliveriesMap = new Map(prev.map(d => [d.id, d]));
                        // Fix: The data from Supabase is not strongly typed. By casting the array to Delivery[],
                        // we ensure that `d.id` is correctly inferred as a number.
                        (data as Delivery[]).forEach((d) => {
                            updatedDeliveriesMap.set(d.id, d);
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
        <div className="flex items-center flex-wrap gap-2">
            <input
                id="delivery-date"
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            />
             <button onClick={handleSave} disabled={isSaving || pendingChanges.size === 0} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg shadow-sm hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                {saveButtonText}
            </button>
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
      
      {customers.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {customers.map(customer => {
                const quantity = getDisplayQuantity(customer.id);
                return (
                    <div key={customer.id} className="bg-white shadow-md rounded-lg p-4 flex flex-col justify-between">
                        <div>
                            <h3 className="font-bold text-lg text-gray-800">{customer.name}</h3>
                            <p className="text-sm text-gray-500">{customer.address}</p>
                        </div>
                        <div className="mt-4 flex items-center justify-between">
                            <label className="text-sm font-medium text-gray-700">Quantity (L):</label>
                            <input
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
         <div className="text-center py-12 px-6 bg-white rounded-lg shadow-md">
            <h3 className="text-lg font-medium text-gray-700">No Customers Found</h3>
            <p className="mt-1 text-sm text-gray-500">Please add customers first to track deliveries.</p>
        </div>
      )}
    </div>
  );
};

export default DeliveryManager;
