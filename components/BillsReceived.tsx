import React, { useState, useMemo } from 'react';
import type { Customer, Delivery, Payment } from '../types';
import { SearchIcon } from './Icons';

interface BillsReceivedProps {
  customers: Customer[];
  deliveries: Delivery[];
  payments: Payment[];
}

interface CustomerBillStatus {
    customer: Customer;
    billForMonth: number;
    paidForMonth: number;
    pendingForMonth: number;
    status: 'Paid' | 'Partially Paid' | 'Pending' | 'No Bill' | 'Overpaid';
}

const BillsReceived: React.FC<BillsReceivedProps> = ({ customers, deliveries, payments }) => {
    const [billingMonth, setBillingMonth] = useState<string>(`${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`);
    const [searchTerm, setSearchTerm] = useState('');

    const customerBillStatuses = useMemo((): CustomerBillStatus[] => {
        const activeCustomers = customers.filter(c => c.status === 'active');
        
        const statuses = activeCustomers.map(customer => {
            const deliveriesForMonth = deliveries.filter(d => d.customerId === customer.id && d.date.startsWith(billingMonth));
            const paymentsForMonth = payments.filter(p => p.customerId === customer.id && p.date.startsWith(billingMonth));

            const billForMonth = deliveriesForMonth.reduce((sum, d) => sum + (d.quantity * customer.milkPrice), 0);
            const paidForMonth = paymentsForMonth.reduce((sum, p) => sum + p.amount, 0);
            const pendingForMonth = billForMonth - paidForMonth;
            
            let status: CustomerBillStatus['status'];

            if (billForMonth <= 0.001) { // Use epsilon for float comparison
                status = 'No Bill';
            } else if (pendingForMonth <= 0.001) {
                 if (paidForMonth > billForMonth) {
                    status = 'Overpaid';
                 } else {
                    status = 'Paid';
                 }
            } else if (paidForMonth > 0) {
                status = 'Partially Paid';
            } else {
                status = 'Pending';
            }

            return { customer, billForMonth, paidForMonth, pendingForMonth, status };
        });

        const lowercasedFilter = searchTerm.toLowerCase().trim();
        if (!lowercasedFilter) {
            return statuses.sort((a,b) => a.customer.name.localeCompare(b.customer.name));
        }

        return statuses.filter(details =>
            details.customer.name.toLowerCase().includes(lowercasedFilter)
        ).sort((a,b) => a.customer.name.localeCompare(b.customer.name));

    }, [billingMonth, customers, deliveries, payments, searchTerm]);

    const getStatusBadge = (status: CustomerBillStatus['status']) => {
        switch (status) {
            case 'Paid':
                return 'bg-green-100 text-green-800';
            case 'Overpaid':
                return 'bg-blue-100 text-blue-800';
            case 'Partially Paid':
                return 'bg-yellow-100 text-yellow-800';
            case 'Pending':
                return 'bg-red-100 text-red-800';
            case 'No Bill':
            default:
                return 'bg-gray-100 text-gray-800';
        }
    };

    return (
        <div>
            <div className="flex flex-col md:flex-row justify-between md:items-center mb-6 gap-4 p-4 bg-white rounded-lg shadow-sm">
                <h2 className="text-3xl font-bold text-gray-800">Bills Received Status</h2>
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 w-full md:w-auto">
                    <div className="relative w-full sm:w-64">
                        <input type="text" placeholder="Search for a customer..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 pl-10 focus:outline-none focus:ring-blue-500 focus:border-blue-500" />
                        <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                    </div>
                    <input type="month" value={billingMonth} onChange={e => setBillingMonth(e.target.value)} className="w-full sm:w-auto border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500" />
                </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow-md">
                 <h3 className="text-xl font-semibold text-gray-800 mb-4">
                    Customer Payment Status for {new Date(billingMonth + '-02').toLocaleString('default', { month: 'long', year: 'numeric' })}
                </h3>
                 {customerBillStatuses.length > 0 ? (
                    <div>
                        {/* Desktop Table View */}
                        <div className="overflow-x-auto hidden md:block">
                            <table className="w-full text-sm text-left text-gray-500">
                                <thead className="text-xs text-gray-700 uppercase bg-gray-50">
                                    <tr>
                                        <th className="px-4 py-3">Customer Name</th>
                                        <th className="px-4 py-3 text-right">Bill Amount</th>
                                        <th className="px-4 py-3 text-right">Amount Paid</th>
                                        <th className="px-4 py-3 text-right">Pending Amount</th>
                                        <th className="px-4 py-3 text-center">Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {customerBillStatuses.map(details => (
                                        <tr key={details.customer.id} className="bg-white border-b hover:bg-gray-50">
                                            <td className="px-4 py-2 font-medium text-gray-900">{details.customer.name}</td>
                                            <td className="px-4 py-2 text-right">₹{details.billForMonth.toFixed(2)}</td>
                                            <td className="px-4 py-2 text-right text-green-600">₹{details.paidForMonth.toFixed(2)}</td>
                                            <td className={`px-4 py-2 text-right font-semibold ${details.pendingForMonth > 0 ? 'text-red-600' : 'text-gray-600'}`}>
                                                ₹{details.pendingForMonth.toFixed(2)}
                                            </td>
                                            <td className="px-4 py-2 text-center">
                                                <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusBadge(details.status)}`}>
                                                    {details.status}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        {/* Mobile Card View */}
                        <div className="space-y-4 md:hidden">
                            {customerBillStatuses.map(details => (
                                <div key={details.customer.id} className="bg-white border rounded-lg shadow-sm p-4">
                                    <div className="flex justify-between items-start mb-2">
                                        <h4 className="font-bold text-lg text-gray-800">{details.customer.name}</h4>
                                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusBadge(details.status)}`}>
                                            {details.status}
                                        </span>
                                    </div>
                                    <div className="text-sm space-y-1 border-t pt-2">
                                        <p className="flex justify-between"><span>Bill Amount:</span> <span>₹{details.billForMonth.toFixed(2)}</span></p>
                                        <p className="flex justify-between"><span>Amount Paid:</span> <span className="text-green-600">₹{details.paidForMonth.toFixed(2)}</span></p>
                                        <p className={`flex justify-between font-bold text-base mt-2 pt-2 border-t ${details.pendingForMonth > 0 ? 'text-red-600' : 'text-gray-600'}`}>
                                            <span>Pending:</span>
                                            <span>₹{details.pendingForMonth.toFixed(2)}</span>
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                ) : (
                    <div className="text-center py-12 px-6">
                        <h3 className="text-lg font-medium text-gray-700">No Customers Found</h3>
                        <p className="mt-1 text-sm text-gray-500">No active customers match your search criteria for this month.</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default BillsReceived;