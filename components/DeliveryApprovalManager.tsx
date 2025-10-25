import React, { useState, useMemo } from 'react';
import type { Customer, PendingDelivery, Delivery } from '../types';
import { supabase } from '../lib/supabaseClient';

interface DeliveryApprovalManagerProps {
  customers: Customer[];
  pendingDeliveries: PendingDelivery[];
  setPendingDeliveries: React.Dispatch<React.SetStateAction<PendingDelivery[]>>;
  deliveries: Delivery[];
  setDeliveries: React.Dispatch<React.SetStateAction<Delivery[]>>;
}

const DeliveryApprovalManager: React.FC<DeliveryApprovalManagerProps> = ({ customers, pendingDeliveries, setPendingDeliveries, deliveries, setDeliveries }) => {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [isApproving, setIsApproving] = useState(false);
  
  const customerMap = useMemo(() => new Map(customers.map(c => [c.id, c.name])), [customers]);

  const pendingDates = useMemo(() => {
    const dates = new Map<string, number>();
    pendingDeliveries.forEach(pd => {
        dates.set(pd.date, (dates.get(pd.date) || 0) + 1);
    });
    return Array.from(dates.entries())
        .map(([date, count]) => ({ date, count }))
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [pendingDeliveries]);
  
  const deliveriesForSelectedDate = useMemo(() => {
    if (!selectedDate) return [];
    return pendingDeliveries.filter(pd => pd.date === selectedDate);
  }, [pendingDeliveries, selectedDate]);

  const handleApproveAll = async () => {
    if (!selectedDate || deliveriesForSelectedDate.length === 0) return;
    setIsApproving(true);
    
    try {
        const deliveriesToUpsert = deliveriesForSelectedDate.map(({ customerId, date, quantity }) => ({
            customerId,
            date,
            quantity,
        }));

        const { error: upsertError } = await supabase.from('deliveries').upsert(deliveriesToUpsert, { onConflict: 'customerId,date' });
        if (upsertError) throw upsertError;

        const { error: deleteError } = await supabase.from('pending_deliveries').delete().eq('date', selectedDate);
        if (deleteError) throw deleteError;

        setDeliveries(prev => {
            const updatedMap = new Map(prev.map(d => [`${d.customerId}-${d.date}`, d]));
            deliveriesToUpsert.forEach(d => updatedMap.set(`${d.customerId}-${d.date}`, d as Delivery));
            return Array.from(updatedMap.values());
        });
        
        setPendingDeliveries(prev => prev.filter(pd => pd.date !== selectedDate));
        
        setSelectedDate(null);
        alert(`Successfully approved ${deliveriesToUpsert.length} deliveries for ${selectedDate}.`);

    } catch (error: any) {
        alert(`Error during approval: ${error.message}`);
    } finally {
        setIsApproving(false);
    }
  };

  return (
    <div>
        <div className="flex justify-between items-center mb-6">
            <h2 className="text-3xl font-bold text-gray-800">Delivery Approvals</h2>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-1 bg-white p-4 rounded-lg shadow-md">
                <h3 className="font-semibold text-lg mb-2">Pending Dates</h3>
                {pendingDates.length > 0 ? (
                    <ul className="space-y-2 max-h-96 overflow-y-auto">
                        {pendingDates.map(({date, count}) => (
                            <li key={date}>
                                <button
                                    onClick={() => setSelectedDate(date)}
                                    className={`w-full text-left p-2 rounded-md transition-colors ${selectedDate === date ? 'bg-blue-600 text-white' : 'bg-gray-100 hover:bg-gray-200'}`}
                                >
                                    <span className="font-medium">{new Date(date + 'T00:00:00Z').toLocaleDateString('en-CA', { timeZone: 'UTC' })}</span>
                                    <span className="text-sm ml-2">({count} submissions)</span>
                                </button>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p className="text-gray-500">No pending deliveries to approve.</p>
                )}
            </div>
            
            <div className="md:col-span-2 bg-white p-4 rounded-lg shadow-md">
                <h3 className="font-semibold text-lg mb-2">Submissions for {selectedDate ? new Date(selectedDate + 'T00:00:00Z').toLocaleDateString('en-CA', { timeZone: 'UTC' }) : '...'}</h3>
                {selectedDate ? (
                    deliveriesForSelectedDate.length > 0 ? (
                        <>
                            <div className="overflow-x-auto max-h-96">
                                <table className="w-full text-sm text-left text-gray-500">
                                    <thead className="text-xs text-gray-700 uppercase bg-gray-50 sticky top-0">
                                        <tr>
                                            <th className="px-4 py-2">Customer</th>
                                            <th className="px-4 py-2 text-right">Quantity (L)</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {deliveriesForSelectedDate.map(pd => (
                                            <tr key={pd.id} className="border-b">
                                                <td className="px-4 py-2 font-medium text-gray-900">{customerMap.get(pd.customerId) || 'Unknown Customer'}</td>
                                                <td className="px-4 py-2 text-right">{pd.quantity}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <div className="mt-4">
                                <button
                                    onClick={handleApproveAll}
                                    disabled={isApproving}
                                    className="w-full px-4 py-2 bg-green-600 text-white rounded-lg shadow-sm hover:bg-green-700 transition-colors disabled:opacity-50"
                                >
                                    {isApproving ? 'Approving...' : `Approve All ${deliveriesForSelectedDate.length} Deliveries`}
                                </button>
                            </div>
                        </>
                    ) : (
                        <p className="text-gray-500">No submissions for this date.</p>
                    )
                ) : (
                    <p className="text-gray-500">Select a date from the left to view and approve submissions.</p>
                )}
            </div>
        </div>
    </div>
  );
};

export default DeliveryApprovalManager;
