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

const parseCsvRow = (row: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < row.length; i++) {
        const char = row[i];
        if (char === '"') {
            if (inQuotes && row[i + 1] === '"') {
                current += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (char === ',' && !inQuotes) {
            result.push(current);
            current = '';
        } else {
            current += char;
        }
    }
    result.push(current);
    return result;
};


const DeliveryManager: React.FC<DeliveryManagerProps> = ({ customers, deliveries, setDeliveries }) => {
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [isSaving, setIsSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [pendingChanges, setPendingChanges] = useState<Map<string, number>>(new Map());
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  const customerMap = useMemo(() => new Map(customers.map(c => [c.id, c])), [customers]);

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

  useEffect(() => {
    setPendingChanges(new Map());
  }, [selectedDate]);

  const deliveriesForDate = useMemo(() => {
    const deliveryMap = new Map<string, Delivery>();
    deliveries.forEach(d => {
        if (d.date === selectedDate) {
            deliveryMap.set(d.customerId, d);
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
        return pendingChanges.get(customerId)!;
    }
    return deliveriesForDate.get(customerId)?.quantity ?? 0;
  }

  const handleSave = async () => {
    if (pendingChanges.size === 0) {
        alert("No changes to save.");
        return;
    }
    setIsSaving(true);

    try {
        const changes = Array.from(pendingChanges.entries());
        
        const dataToUpsert = changes.map(([customerId, quantity]) => {
            const existing = deliveriesForDate.get(customerId);
            return {
                id: existing?.id, // Pass ID for upsert to work as update
                customerId,
                date: selectedDate,
                quantity,
            };
        });

        const deliveriesToUpsert = dataToUpsert.filter(d => d.quantity > 0);
        const deliveriesToDelete = dataToUpsert
            .filter(d => d.quantity === 0 && d.id)
            .map(d => d.id as number);

        const upsertPromise = deliveriesToUpsert.length > 0 
            ? supabase.from('deliveries').upsert(deliveriesToUpsert).select()
            : Promise.resolve({ data: [], error: null });

        const deletePromise = deliveriesToDelete.length > 0
            ? supabase.from('deliveries').delete().in('id', deliveriesToDelete)
            : Promise.resolve({ error: null });

        const [upsertResult, deleteResult] = await Promise.all([upsertPromise, deletePromise]);

        if (upsertResult.error) throw upsertResult.error;
        if (deleteResult.error) throw deleteResult.error;

        setDeliveries(prev => {
            const afterDelete = prev.filter(d => !deliveriesToDelete.includes(d.id));
            const updatedMap = new Map(afterDelete.map(d => [`${d.customerId}-${d.date}`, d]));
            if (upsertResult.data) {
                (upsertResult.data as Delivery[]).forEach(d => updatedMap.set(`${d.customerId}-${d.date}`, d));
            }
            return Array.from(updatedMap.values());
        });

        setPendingChanges(new Map());
        alert(`Successfully saved ${changes.length} delivery records.`);

    } catch (error: any) {
        alert(`Error saving deliveries: ${getFriendlyErrorMessage(error)}`);
    } finally {
        setIsSaving(false);
    }
  };

  const handleExport = () => {
    const headers = ['date', 'customerName', 'quantity'];
    const csvRows = [
        headers.join(','),
        ...deliveries.map(d => [
            d.date,
            (customerMap.get(d.customerId)?.name || 'Unknown').replace(/,/g, ''),
            d.quantity
        ].join(','))
    ];
    downloadCSV(csvRows.join('\n'), 'deliveries_export.csv');
  };

  const handleDownloadTemplate = () => {
    const headers = 'date,customerPhone,quantity';
    const sampleData = `2024-01-01,9876543210,1.5\n2024-01-01,1234567890,0.5`;
    downloadCSV([headers, sampleData].join('\n'), 'deliveries_template.csv');
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };
  
  const processAndImportDeliveries = async (csvText: string) => {
    const rows = csvText.split('\n').filter(row => row.trim() !== '');
    if (rows.length < 2) {
        throw new Error("CSV data is empty or contains only a header.");
    }

    const header = parseCsvRow(rows[0]).map(h => h.trim());
    const requiredHeaders = ['date', 'customerPhone', 'quantity'];
    if (!requiredHeaders.every(h => header.includes(h))) {
        throw new Error(`Invalid CSV header. Required headers are: ${requiredHeaders.join(', ')}`);
    }
    
    const phoneToIdMap = new Map<string, string>();
    customers.forEach(c => {
        if (c.phone) {
            const phoneDigits = c.phone.replace(/\D/g, '').slice(-10);
            if (phoneDigits) phoneToIdMap.set(phoneDigits, c.id);
        }
    });
    
    const parsedDeliveries = rows.slice(1).map(row => {
        const values = parseCsvRow(row);
        const getColumnValue = (columnName: string) => {
             const index = header.indexOf(columnName);
             if (index === -1) return '';
             return values[index]?.trim() || '';
        };

        const phone = getColumnValue('customerPhone').replace(/\D/g, '').slice(-10);
        const customerId = phoneToIdMap.get(phone);
        
        if (!customerId) return null;

        return {
            customerId,
            date: getColumnValue('date'),
            quantity: parseFloat(getColumnValue('quantity')) || 0,
        };
    }).filter(d => d !== null && d.date && d.quantity > 0) as Omit<Delivery, 'id' | 'userId'>[];

    if (parsedDeliveries.length === 0) {
        alert("No valid delivery data found to import. Make sure customer phone numbers and dates are correct.");
        return;
    }

    const { data, error } = await supabase.from('deliveries').upsert(parsedDeliveries, { onConflict: 'customerId,date' }).select();
    if (error) throw error;
    
    if (data) {
        setDeliveries(prev => {
            const deliveryMap = new Map(prev.map(d => [`${d.customerId}-${d.date}`, d]));
            (data as Delivery[]).forEach(d => deliveryMap.set(`${d.customerId}-${d.date}`, d));
            return Array.from(deliveryMap.values());
        });
        alert(`${data.length} delivery records were successfully imported or updated.`);
    }
  };

  const handleFileImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const text = e.target?.result;
            if (typeof text !== 'string') throw new Error('Could not read file content.');
            await processAndImportDeliveries(text);
        } catch (error: any) {
            alert("An error occurred while importing: " + getFriendlyErrorMessage(error));
        } finally {
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };
    reader.readAsText(file);
  };

  return (
    <div className="pb-24">
      <div className="flex flex-col md:flex-row justify-between md:items-center mb-6 gap-4">
        <h2 className="text-3xl font-bold text-gray-800">Manage Deliveries</h2>
        <div className="flex items-center flex-wrap gap-2">
            <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500" />
            <div className="relative">
                <input type="text" placeholder="Search customers..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="border border-gray-300 rounded-lg shadow-sm py-2 px-3 pl-10 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm" />
                <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
            </div>
            <input type="file" accept=".csv" ref={fileInputRef} onChange={handleFileImport} className="hidden" />
            <button onClick={handleImportClick} className="flex items-center px-3 py-2 text-sm bg-gray-600 text-white rounded-lg shadow-sm hover:bg-gray-700"><UploadIcon className="h-4 w-4 mr-2"/> Import</button>
            <button onClick={handleExport} className="flex items-center px-3 py-2 text-sm bg-gray-600 text-white rounded-lg shadow-sm hover:bg-gray-700"><DownloadIcon className="h-4 w-4 mr-2"/> Export</button>
            <button onClick={handleDownloadTemplate} className="flex items-center px-3 py-2 text-sm text-gray-600 border rounded-lg hover:bg-gray-100">Template</button>
        </div>
      </div>

        {filteredActiveCustomers.length > 0 ? (
            <div className="bg-white shadow-md rounded-lg overflow-hidden">
                <table className="w-full text-sm text-left text-gray-500">
                    <thead className="text-xs text-gray-700 uppercase bg-gray-50">
                        <tr>
                            <th scope="col" className="px-6 py-3">Customer Name</th>
                            <th scope="col" className="px-6 py-3 text-right">Quantity (L)</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredActiveCustomers.map(customer => (
                            <tr key={customer.id} className="bg-white border-b hover:bg-gray-50">
                                <td className="px-6 py-4 font-medium text-gray-900">{customer.name}</td>
                                <td className="px-6 py-4 text-right">
                                    <QuantityInput
                                        value={getDisplayQuantity(customer.id)}
                                        onChange={(newValue) => handleQuantityChange(customer.id, newValue)}
                                        placeholder={String(customer.defaultQuantity)}
                                    />
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        ) : (
             <div className="text-center py-12 px-6 bg-white rounded-lg shadow-md">
                <h3 className="text-lg font-medium text-gray-700">No Customers Match Your Search</h3>
                <p className="mt-1 text-sm text-gray-500">Try a different name or add customers.</p>
            </div>
        )}

      {pendingChanges.size > 0 && (
        <div className="fixed bottom-0 right-0 left-0 lg:left-64 bg-white/90 backdrop-blur-sm border-t border-gray-200 z-40 shadow-lg">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
                <div className="flex justify-between items-center">
                    <span className="text-gray-700 font-medium">
                        You have {pendingChanges.size} unsaved change{pendingChanges.size > 1 ? 's' : ''}.
                    </span>
                    <button onClick={handleSave} disabled={isSaving} className="px-6 py-2 text-sm font-semibold bg-blue-600 text-white rounded-lg shadow-sm hover:bg-blue-700 transition-colors disabled:opacity-50">
                        {isSaving ? 'Saving...' : 'Save Changes'}
                    </button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};

export default DeliveryManager;