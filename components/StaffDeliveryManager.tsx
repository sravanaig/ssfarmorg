
import React, { useState, useMemo, useEffect } from 'react';
import type { Customer, Order, PendingDelivery } from '../types';
import { supabase } from '../lib/supabaseClient';
import { SearchIcon } from './Icons';
import { getFriendlyErrorMessage } from '../lib/errorHandler';
import QuantityInput from './QuantityInput';

interface StaffDeliveryManagerProps {
  customers: Customer[];
  orders: Order[];
  pendingDeliveries: PendingDelivery[];
  setPendingDeliveries: React.Dispatch<React.SetStateAction<PendingDelivery[]>>;
}

const StaffDeliveryManager: React.FC<StaffDeliveryManagerProps> = ({ customers, orders, pendingDeliveries, setPendingDeliveries }) => {
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [isSaving, setIsSaving] = useState(false);
  const [pendingChanges, setPendingChanges] = useState<Map<string, number>>(new Map());
  const [searchTerm, setSearchTerm] = useState('');

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

  const ordersForDate = useMemo(() => {
    const map = new Map<string, number>();
    orders.forEach(o => {
        if (o.date === selectedDate) map.set(o.customerId, o.quantity);
    });
    return map;
  }, [orders, selectedDate]);

  const pendingDeliveriesForDate = useMemo(() => {
    const map = new Map<string, number>();
    pendingDeliveries.forEach(pd => {
        if (pd.date === selectedDate) map.set(pd.customerId, pd.quantity);
    });
    return map;
  }, [pendingDeliveries, selectedDate]);

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
        return value!;
    }
    if (pendingDeliveriesForDate.has(customerId)) {
        return pendingDeliveriesForDate.get(customerId)!;
    }
    if (ordersForDate.has(customerId)) {
        return ordersForDate.get(customerId)!;
    }
    const customer = customers.find(c => c.id === customerId);
    return customer ? customer.defaultQuantity : 0;
  }
  
  const handleSave = async () => {
    if (pendingChanges.size === 0) {
        alert("No changes to submit.");
        return;
    }
    setIsSaving(true);
    try {
        const changes = Array.from(pendingChanges.entries());
        const dataToUpsert = changes.map(([customerId, quantity]) => ({ customerId, date: selectedDate, quantity }));

        const { data, error } = await supabase.from('pending_deliveries').upsert(dataToUpsert, { onConflict: 'customerId,date' }).select();
        
        if (error) throw error;

        setPendingDeliveries(prev => {
            const updatedMap = new Map(prev.map(pd => [`${pd.customerId}-${pd.date}`, pd]));
            if (data) {
                (data as PendingDelivery[]).forEach(pd => updatedMap.set(`${pd.customerId}-${pd.date}`, pd));
            }
            return Array.from(updatedMap.values());
        });

        setPendingChanges(new Map());
        alert(`Successfully submitted ${changes.length} delivery records for admin approval.`);
    } catch (error: any) {
        alert(`Error submitting deliveries: ${getFriendlyErrorMessage(error)}`);
    } finally {
        setIsSaving(false);
    }
  };

  return (
    <div>
      <div className="flex flex-col md:flex-row justify-between md:items-center mb-6 gap-4">
        <h2 className="text-3xl font-bold text-gray-800">Submit Daily Deliveries</h2>
        <div className="flex items-center flex-wrap gap-2">
            <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500" />
            <div className="relative">
                <input type="text" placeholder="Search customers..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="border border-gray-300 rounded-lg shadow-sm py-2 px-3 pl-10 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm" />
                <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
            </div>
        </div>
      </div>
      
      {activeCustomers.length > 0 ? (
        filteredActiveCustomers.length > 0 ? (
        <div className="pb-24">
            <div className="bg-white shadow-md rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left text-gray-500">
                        <thead className="text-xs text-gray-700 uppercase bg-gray-50">
                            <tr>
                                <th scope="col" className="px-6 py-3">Name</th>
                                <th scope="col" className="px-6 py-3">Status</th>
                                <th scope="col" className="px-6 py-3 text-right">Delivery Quantity (L)</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredActiveCustomers.map(customer => {
                                const quantity = getDisplayQuantity(customer.id);
                                const isSubmitted = pendingDeliveriesForDate.has(customer.id);
                                return (
                                    <tr key={customer.id} className="bg-white border-b hover:bg-gray-50">
                                        <th scope="row" className="px-6 py-4 font-medium text-gray-900 whitespace-nowrap">{customer.name}</th>
                                        <td className="px-6 py-4">
                                            {isSubmitted ? (
                                                <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-yellow-100 text-yellow-800">Pending Approval</span>
                                            ) : (
                                                <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-gray-100 text-gray-800">Not Submitted</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <QuantityInput
                                                value={quantity}
                                                onChange={(newValue) => handleQuantityChange(customer.id, newValue)}
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
            <p className="mt-1 text-sm text-gray-500">The admin needs to add active customers first.</p>
        </div>
      )}

      {pendingChanges.size > 0 && (
        <div className="fixed bottom-0 right-0 left-0 lg:left-0 bg-white/90 backdrop-blur-sm border-t border-gray-200 z-40 shadow-lg">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
                <div className="flex justify-between items-center">
                    <span className="text-gray-700 font-medium">
                        You have {pendingChanges.size} unsaved change{pendingChanges.size > 1 ? 's' : ''}.
                    </span>
                    <button onClick={handleSave} disabled={isSaving} className="px-6 py-2 text-sm font-semibold bg-blue-600 text-white rounded-lg shadow-sm hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                        {isSaving ? 'Submitting...' : 'Submit for Approval'}
                    </button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};

export default StaffDeliveryManager;
