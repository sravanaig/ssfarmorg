import React, { useMemo, useState } from 'react';
import type { Customer, Delivery, Payment } from '../types';
import { MilkIcon, LogoutIcon } from './Icons';

interface CustomerDashboardProps {
    customer: Customer;
    deliveries: Delivery[];
    payments: Payment[];
    onLogout: () => void;
}

const CustomerDashboard: React.FC<CustomerDashboardProps> = ({ customer, deliveries, payments, onLogout }) => {
    const [billingMonth, setBillingMonth] = useState<string>(`${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`);

    const billDetails = useMemo(() => {
        const [year, month] = billingMonth.split('-').map(Number);
        const startDate = new Date(Date.UTC(year, month - 1, 1));
        const endDate = new Date(Date.UTC(year, month, 0));

        let previousBalance = 0;
        if (customer.balanceAsOfDate && customer.previousBalance != null) {
            const openingBalanceDate = new Date(customer.balanceAsOfDate + 'T00:00:00Z');
            previousBalance = customer.previousBalance;

            const interimDeliveries = deliveries.filter(d => {
                const deliveryDate = new Date(d.date + 'T00:00:00Z');
                return deliveryDate >= openingBalanceDate && deliveryDate < startDate;
            });
            const interimPayments = payments.filter(p => {
                const paymentDate = new Date(p.date + 'T00:00:00Z');
                return paymentDate >= openingBalanceDate && paymentDate < startDate;
            });

            const totalInterimDue = interimDeliveries.reduce((sum, d) => sum + (d.quantity * customer.milkPrice), 0);
            const totalInterimPaid = interimPayments.reduce((sum, p) => sum + p.amount, 0);
            previousBalance += (totalInterimDue - totalInterimPaid);
        } else {
             const historicalDeliveries = deliveries.filter(d => new Date(d.date + 'T00:00:00Z') < startDate);
             const historicalPayments = payments.filter(p => new Date(p.date + 'T00:00:00Z') < startDate);
             const totalHistoricalDue = historicalDeliveries.reduce((sum, d) => sum + (d.quantity * customer.milkPrice), 0);
             const totalHistoricalPaid = historicalPayments.reduce((sum, p) => sum + p.amount, 0);
             previousBalance = totalHistoricalDue - totalHistoricalPaid;
        }

        const deliveriesForPeriod = deliveries.filter(d => {
            const deliveryDate = new Date(d.date + 'T00:00:00Z');
            return deliveryDate >= startDate && deliveryDate <= endDate;
        }).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        const paymentsForPeriod = payments.filter(p => {
            const paymentDate = new Date(p.date + 'T00:00:00Z');
            return paymentDate >= startDate && paymentDate <= endDate;
        }).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        const totalQuantity = deliveriesForPeriod.reduce((sum, d) => sum + d.quantity, 0);
        const totalAmount = totalQuantity * customer.milkPrice;
        const totalPaid = paymentsForPeriod.reduce((sum, p) => sum + p.amount, 0);
        const balance = previousBalance + totalAmount - totalPaid;

        return { deliveriesForPeriod, paymentsForPeriod, totalQuantity, totalAmount, totalPaid, balance, previousBalance };
    }, [billingMonth, customer, deliveries, payments]);

    return (
        <div className="min-h-screen bg-gray-50 font-sans">
            <header className="bg-white shadow-sm">
                <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
                    <div className="flex items-center space-x-2">
                        <MilkIcon className="h-8 w-8 text-blue-600"/>
                        <span className="text-xl font-bold text-gray-800">ssfarmorganic</span>
                    </div>
                    <button onClick={onLogout} className="flex items-center px-3 py-2 text-sm bg-red-500 text-white rounded-md hover:bg-red-600 transition-colors">
                        <LogoutIcon className="h-5 w-5 md:mr-2" />
                        <span className="hidden md:block">Logout</span>
                    </button>
                </div>
            </header>

            <main className="container mx-auto p-4 sm:p-6 lg:p-8">
                <h1 className="text-3xl font-bold text-gray-800 mb-2">Welcome, {customer.name}!</h1>
                <p className="text-gray-600 mb-6">Here's a summary of your account.</p>

                <div className="mb-6 p-4 bg-white rounded-lg shadow-sm">
                     <label htmlFor="billing-month" className="text-sm font-medium text-gray-700 mr-2">Showing summary for:</label>
                     <input
                        id="billing-month"
                        type="month"
                        value={billingMonth}
                        onChange={e => setBillingMonth(e.target.value)}
                        className="border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    />
                </div>

                <div className="bg-white p-6 rounded-lg shadow-lg mb-8">
                    <h2 className="text-xl font-semibold text-gray-800 mb-4">
                        Billing Summary for {new Date(billingMonth + '-02').toLocaleString('default', { month: 'long', year: 'numeric' })}
                    </h2>
                    <div className="space-y-2 text-gray-700">
                        <p className="flex justify-between"><span>Previous Balance:</span> <strong>₹{billDetails.previousBalance.toFixed(2)}</strong></p>
                        <p className="flex justify-between"><span>This Month's Bill:</span> <strong>₹{billDetails.totalAmount.toFixed(2)}</strong></p>
                        <p className="flex justify-between text-sm text-gray-500 pl-4"><span>(Total Quantity: {billDetails.totalQuantity.toFixed(2)} L)</span></p>
                        <p className="flex justify-between border-t pt-2 mt-2"><span>Total Amount Due:</span> <strong>₹{(billDetails.previousBalance + billDetails.totalAmount).toFixed(2)}</strong></p>
                        <p className="flex justify-between"><span>Payments Received This Month:</span> <strong className="text-green-600">- ₹{billDetails.totalPaid.toFixed(2)}</strong></p>
                        <p className={`flex justify-between text-xl font-bold border-t pt-2 mt-2 ${billDetails.balance > 0 ? 'text-red-600' : 'text-green-600'}`}>
                            <span>Outstanding Balance:</span> 
                            <span>₹{billDetails.balance.toFixed(2)}</span>
                        </p>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    <div className="bg-white p-6 rounded-lg shadow-lg">
                        <h2 className="text-xl font-semibold text-gray-800 mb-4">Monthly Deliveries</h2>
                        <div className="overflow-y-auto max-h-96">
                            {billDetails.deliveriesForPeriod.length > 0 ? (
                                <table className="w-full text-sm">
                                    <thead className="bg-gray-50 sticky top-0"><tr><th className="px-4 py-2 text-left font-medium text-gray-600">Date</th><th className="px-4 py-2 text-right font-medium text-gray-600">Quantity (L)</th></tr></thead>
                                    <tbody>
                                        {billDetails.deliveriesForPeriod.map((d) => (
                                            <tr key={d.id} className="border-t">
                                                <td className="px-4 py-2 text-gray-700">{new Date(d.date + 'T00:00:00Z').toLocaleDateString('en-GB', { timeZone: 'UTC', day: '2-digit', month: 'short' })}</td>
                                                <td className="px-4 py-2 text-right font-medium">{d.quantity.toFixed(2)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            ) : (
                                <p className="text-center text-gray-500 py-8">No deliveries recorded for this month.</p>
                            )}
                        </div>
                    </div>
                    <div className="bg-white p-6 rounded-lg shadow-lg">
                        <h2 className="text-xl font-semibold text-gray-800 mb-4">Monthly Payments</h2>
                        <div className="overflow-y-auto max-h-96">
                             {billDetails.paymentsForPeriod.length > 0 ? (
                                <table className="w-full text-sm">
                                    <thead className="bg-gray-50 sticky top-0"><tr><th className="px-4 py-2 text-left font-medium text-gray-600">Date</th><th className="px-4 py-2 text-right font-medium text-gray-600">Amount Paid</th></tr></thead>
                                    <tbody>
                                        {billDetails.paymentsForPeriod.map((p) => (
                                            <tr key={p.id} className="border-t">
                                                <td className="px-4 py-2 text-gray-700">{new Date(p.date + 'T00:00:00Z').toLocaleDateString('en-GB', { timeZone: 'UTC', day: '2-digit', month: 'short' })}</td>
                                                <td className="px-4 py-2 text-right font-medium text-green-600">₹{p.amount.toFixed(2)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            ) : (
                                <p className="text-center text-gray-500 py-8">No payments recorded for this month.</p>
                            )}
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
};

export default CustomerDashboard;