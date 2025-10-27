import React, { useState, useMemo, useEffect } from 'react';
import type { Customer, Order } from '../types';
import { supabase } from '../lib/supabaseClient';
import { SearchIcon, WhatsAppIcon } from './Icons';

interface OrderManagerProps {
  customers: Customer[];
  orders: Order[];
  setOrders: React.Dispatch<React.SetStateAction<Order[]>>;
}

const OrderManager: React.FC<OrderManagerProps> = ({ customers, orders, setOrders }) => {
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
    // Clear pending changes when the date is changed
    setPendingChanges(new Map());
  }, [selectedDate]);

  const ordersForDate = useMemo(() => {
    const orderMap = new Map<string, number>();
    orders.forEach(d => {
        if (d.date === selectedDate) {
            orderMap.set(d.customerId, d.quantity);
        }
    });
    return orderMap;
  }, [orders, selectedDate]);

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

    const orderQty = ordersForDate.get(customerId);
    if(orderQty !== undefined) return orderQty;

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
        const changes = Array.from(pendingChanges.entries());
        
        const dataToUpsert = changes.map(([customerId, quantity]) => ({
            customerId,
            date: selectedDate,
            quantity,
        }));

        const ordersToUpsert = dataToUpsert.filter(d => d.quantity > 0);
        const customerIdsToDelete = dataToUpsert
            .filter(d => d.quantity === 0)
            .map(d => d.customerId)
            .filter(id => ordersForDate.has(id));

        const orderUpsertPromise = ordersToUpsert.length > 0 
            ? supabase.from('orders').upsert(ordersToUpsert, { onConflict: 'customerId,date' }).select()
            : Promise.resolve({ data: [], error: null });
        
        const orderDeletePromise = customerIdsToDelete.length > 0
            ? supabase.from('orders').delete().eq('date', selectedDate).in('customerId', customerIdsToDelete)
            : Promise.resolve({ error: null });

        const [orderUpsertResult, orderDeleteResult] = await Promise.all([orderUpsertPromise, orderDeletePromise]);
        
        if (orderUpsertResult.error) throw orderUpsertResult.error;
        if (orderDeleteResult.error) throw orderDeleteResult.error;

        setOrders(prev => {
            const afterDelete = prev.filter(o => !(o.date === selectedDate && customerIdsToDelete.includes(o.customerId)));
            const updatedMap = new Map(afterDelete.map(o => [`${o.customerId}-${o.date}`, o]));
            if (orderUpsertResult.data) {
                (orderUpsertResult.data as Order[]).forEach(o => updatedMap.set(`${o.customerId}-${o.date}`, o));
            }
            return Array.from(updatedMap.values());
        });

        setPendingChanges(new Map());
        alert(`Successfully saved ${changes.length} orders for ${selectedDate}.`);

    } catch (error: any) {
        alert(`Error saving orders: ${error.message}`);
    } finally {
        setIsSaving(false);
    }
  };
  
  const handleSetAllDefaults = () => {
    const newChanges = new Map(pendingChanges);
    let changesMade = 0;
    activeCustomers.forEach(customer => {
        if (!ordersForDate.has(customer.id) && !newChanges.has(customer.id)) {
            newChanges.set(customer.id, customer.defaultQuantity);
            changesMade++;
        }
    });

    if (changesMade > 0) {
        setPendingChanges(newChanges);
        alert(`${changesMade} customers have been set to their default quantity. Click 'Save Orders' to confirm.`);
    } else {
        alert("All active customers already have an order entry or a pending change for this date.");
    }
  };

  const handleSendWhatsApp = () => {
    const ordersToSend = new Map<string, number>();

    filteredActiveCustomers.forEach(customer => {
        const quantity = getDisplayQuantity(customer.id);
        const finalQuantity = (typeof quantity === 'string' && quantity === '') ? 0 : Number(quantity);
        if (finalQuantity > 0) {
            ordersToSend.set(customer.id, finalQuantity);
        }
    });
    
    if (ordersToSend.size === 0) {
        alert("No orders with a quantity greater than 0 to send for the selected date.");
        return;
    }
    
    let totalQuantity = 0;
    // FIX: Explicitly type customerMap to resolve type inference issue.
    const customerMap: Map<string, string> = new Map(customers.map(c => [c.id, c.name]));

    const orderLines = Array.from(ordersToSend.entries())
        .sort((a, b) => {
            const nameA = customerMap.get(a[0]) || '';
            const nameB = customerMap.get(b[0]) || '';
            return nameA.localeCompare(nameB);
        })
        .map(([customerId, quantity]) => {
            totalQuantity += quantity;
            const customerName = customerMap.get(customerId) || 'Unknown Customer';
            return `- ${customerName}: ${quantity} L`;
        })
        .join('\n');
    
    const formattedDate = new Date(selectedDate + 'T00:00:00Z').toLocaleDateString('en-GB', { timeZone: 'UTC', day: '2-digit', month: 'long', year: 'numeric' });

    const message = `
*Orders for ${formattedDate}*

${orderLines}

-----------------------------------
*Total Quantity: ${totalQuantity.toFixed(2)} L*
*Total Customers: ${ordersToSend.size}*
    `.trim().replace(/^\s+/gm, '');

    const phoneNumber = '8333977567';
    const whatsappUrl = `https://wa.me/${phoneNumber}?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, '_blank');
  };

  return (
    <div>
      <div className="flex flex-col md:flex-row justify-between md:items-center mb-6 gap-4">
        <h2 className="text-3xl font-bold text-gray-800">Daily Orders</h2>
        <div className="flex items-center flex-wrap gap-2">
            <input
                id="order-date"
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            />
             <button onClick={handleSetAllDefaults} className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg shadow-sm hover:bg-indigo-700 transition-colors">
                Set All to Default
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
             <button onClick={handleSendWhatsApp} className="flex items-center px-4 py-2 text-sm bg-green-500 text-white rounded-lg shadow-sm hover:bg-green-600 transition-colors">
                <WhatsAppIcon className="h-5 w-5 mr-2"/> Send to WhatsApp
            </button>
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
                                <th scope="col" className="px-6 py-3 hidden sm:table-cell">Address</th>
                                <th scope="col" className="px-6 py-3 text-right">Order Quantity (L)</th>
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
                                            <label htmlFor={`quantity-list-${customer.id}`} className="sr-only">Order Quantity for {customer.name}</label>
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
            <p className="mt-1 text-sm text-gray-500">Please add customers or mark them as active to set orders.</p>
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
                        {isSaving ? 'Saving...' : 'Save Orders'}
                    </button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};

export default OrderManager;