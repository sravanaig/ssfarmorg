import React, { useState, useMemo } from 'react';
import type { Customer, Delivery, Payment } from '../types';
import { ShareIcon, PrintIcon } from './Icons';

interface BillManagerProps {
  customers: Customer[];
  deliveries: Delivery[];
  payments: Payment[];
}

const BillManager: React.FC<BillManagerProps> = ({ customers, deliveries, payments }) => {
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | ''>('');
  const [billingMonth, setBillingMonth] = useState<string>(`${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`);

  const handlePrint = () => {
    window.print();
  };
  
  const handleSendBill = async () => {
    if (!billDetails) return;

    const {
        customer,
        totalQuantity,
        totalAmount,
        totalPaid,
        balance,
        previousBalance
    } = billDetails;
    
    // Format the billing period for display
    const [year, month] = billingMonth.split('-');
    const billingPeriod = new Date(parseInt(year), parseInt(month) - 1, 1).toLocaleString('default', { month: 'long', year: 'numeric' });

    const message = `
Hi ${customer.name},

Here is your milk bill summary from *ssfatmorganic* for *${billingPeriod}*.

*Summary*
-----------------------------------
Previous Balance: ₹${previousBalance.toFixed(2)}
This Month's Bill: ₹${totalAmount.toFixed(2)}
  (Total Quantity: ${totalQuantity.toFixed(2)} L)
Payments Received: ₹${totalPaid.toFixed(2)}
-----------------------------------
*Outstanding Balance: ₹${balance.toFixed(2)}*

Thank you for your business!
`.trim().replace(/^\s+/gm, '');

    if (navigator.share) {
        try {
            await navigator.share({
                title: `Milk Bill for ${customer.name}`,
                text: message,
            });
        } catch (error) {
            console.error('Error sharing:', error);
            // Fallback to clipboard if sharing is cancelled or fails
             navigator.clipboard.writeText(message).then(() => {
                alert('Sharing was cancelled. Bill copied to clipboard!');
            });
        }
    } else {
        // Fallback for browsers that don't support Web Share API
        navigator.clipboard.writeText(message).then(() => {
            alert('Bill details copied to clipboard!');
        });
    }
};

  const billDetails = useMemo(() => {
    if (!selectedCustomerId || !billingMonth) return null;

    const customer = customers.find(c => c.id === selectedCustomerId);
    if (!customer) return null;

    const [year, month] = billingMonth.split('-').map(Number);
    
    const startDate = new Date(Date.UTC(year, month - 1, 1));
    const endDate = new Date(Date.UTC(year, month, 0));
    
    // Previous Balance Calculation
    const historicalDeliveries = deliveries.filter(d => {
        const deliveryDate = new Date(d.date + 'T00:00:00Z');
        return d.customerId === selectedCustomerId && deliveryDate < startDate;
    });
    const historicalPayments = payments.filter(p => {
        const paymentDate = new Date(p.date + 'T00:00:00Z');
        return p.customerId === selectedCustomerId && paymentDate < startDate;
    });

    const totalHistoricalDue = historicalDeliveries.reduce((sum, d) => sum + (d.quantity * customer.milkPrice), 0);
    const totalHistoricalPaid = historicalPayments.reduce((sum, p) => sum + p.amount, 0);
    const previousBalance = totalHistoricalDue - totalHistoricalPaid;

    // Current Month Deliveries
    const customerDeliveries = deliveries.filter(d => {
      const deliveryDate = new Date(d.date + 'T00:00:00Z');
      return d.customerId === selectedCustomerId && deliveryDate >= startDate && deliveryDate <= endDate;
    }).sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // Current Month Payments
    const customerPayments = payments.filter(p => {
        const paymentDate = new Date(p.date + 'T00:00:00Z');
        return p.customerId === selectedCustomerId && paymentDate >= startDate && paymentDate <= endDate;
    });

    const totalQuantity = customerDeliveries.reduce((sum, d) => sum + d.quantity, 0);
    const totalAmount = totalQuantity * customer.milkPrice;
    const totalPaid = customerPayments.reduce((sum, p) => sum + p.amount, 0);
    const balance = previousBalance + totalAmount - totalPaid;

    return {
      customer,
      period: `${startDate.toLocaleDateString('en-CA', { timeZone: 'UTC' })} - ${endDate.toLocaleDateString('en-CA', { timeZone: 'UTC' })}`,
      deliveries: customerDeliveries,
      payments: customerPayments,
      totalQuantity,
      totalAmount,
      totalPaid,
      balance,
      previousBalance
    };
  }, [selectedCustomerId, billingMonth, customers, deliveries, payments]);

  return (
    <div>
      <div className="flex flex-col md:flex-row justify-between md:items-center mb-6 gap-4 p-4 bg-white rounded-lg shadow-sm print:hidden">
        <h2 className="text-3xl font-bold text-gray-800">Generate Bills</h2>
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <select
            value={selectedCustomerId}
            onChange={e => setSelectedCustomerId(e.target.value ? parseInt(e.target.value) : '')}
            className="w-full sm:w-auto border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">Select a Customer</option>
            {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <input
            type="month"
            value={billingMonth}
            onChange={e => setBillingMonth(e.target.value)}
            className="w-full sm:w-auto border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
      </div>

      {billDetails ? (
        <div className="bg-white p-6 md:p-8 rounded-lg shadow-lg">
          <div className="flex justify-between items-start mb-6 border-b pb-4">
            <div>
              <h3 className="text-2xl font-bold text-gray-900">{billDetails.customer.name}</h3>
              <p className="text-gray-600">{billDetails.customer.address}</p>
              <p className="text-gray-600">{billDetails.customer.phone}</p>
            </div>
            <div className="text-right">
              <h4 className="text-xl font-semibold text-gray-800">Bill Details</h4>
              <p className="text-gray-600">Period: {billDetails.period}</p>
            </div>
          </div>

          <h4 className="text-lg font-semibold text-gray-800 mb-2">Deliveries for {new Date(billingMonth + '-02').toLocaleString('default', { month: 'long', year: 'numeric' })}</h4>
          <div className="overflow-x-auto max-h-60 mb-4 border rounded-md">
            <table className="w-full text-sm">
                <thead className="bg-gray-50 sticky top-0">
                    <tr>
                        <th className="px-4 py-2 text-left font-medium text-gray-600">Date</th>
                        <th className="px-4 py-2 text-right font-medium text-gray-600">Quantity (L)</th>
                    </tr>
                </thead>
                <tbody>
                    {billDetails.deliveries.map(d => (
                        <tr key={d.id} className="border-t">
                            <td className="px-4 py-2 text-gray-700">{new Date(d.date + 'T00:00:00Z').toLocaleDateString('en-CA', { timeZone: 'UTC' })}</td>
                            <td className="px-4 py-2 text-right text-gray-700">{d.quantity.toFixed(2)}</td>
                        </tr>
                    ))}
                    {billDetails.deliveries.length === 0 && (
                        <tr><td colSpan={2} className="text-center text-gray-500 p-4">No deliveries this month.</td></tr>
                    )}
                </tbody>
            </table>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div>
              <h4 className="text-lg font-semibold text-gray-800 mb-2">Summary</h4>
              <div className="space-y-2 text-gray-700">
                <p className="flex justify-between"><span>Previous Balance:</span> <strong>₹{billDetails.previousBalance.toFixed(2)}</strong></p>
                <p className="flex justify-between"><span>This Month's Bill:</span> <strong>₹{billDetails.totalAmount.toFixed(2)}</strong></p>
                <p className="flex justify-between text-sm text-gray-500 pl-4"><span>(Total Quantity: {billDetails.totalQuantity.toFixed(2)} L @ ₹{billDetails.customer.milkPrice.toFixed(2)}/L)</span></p>
                <p className="flex justify-between border-t pt-2 mt-2"><span>Total Amount Due:</span> <strong>₹{(billDetails.previousBalance + billDetails.totalAmount).toFixed(2)}</strong></p>
                <p className="flex justify-between"><span>Payments Received:</span> <strong className="text-green-600">- ₹{billDetails.totalPaid.toFixed(2)}</strong></p>
                <p className="flex justify-between text-xl font-bold border-t pt-2 mt-2 text-blue-600"><span>Outstanding Balance:</span> <span>₹{billDetails.balance.toFixed(2)}</span></p>
              </div>
            </div>
          </div>
           <div className="mt-8 flex justify-center items-center gap-4 print:hidden">
                <button onClick={handleSendBill} className="flex items-center px-6 py-2 bg-green-600 text-white rounded-lg shadow-sm hover:bg-green-700 transition-colors">
                    <ShareIcon className="h-5 w-5 mr-2" />
                    Send Bill
                </button>
                <button onClick={handlePrint} className="flex items-center px-6 py-2 bg-blue-600 text-white rounded-lg shadow-sm hover:bg-blue-700 transition-colors">
                    <PrintIcon className="h-5 w-5 mr-2" />
                    Print Bill
                </button>
            </div>
        </div>
      ) : (
        <div className="text-center py-12 px-6 bg-white rounded-lg shadow-md">
            <h3 className="text-lg font-medium text-gray-700">Select Customer and Month</h3>
            <p className="mt-1 text-sm text-gray-500">Choose a customer and billing period to view the bill.</p>
        </div>
      )}
    </div>
  );
};

export default BillManager;