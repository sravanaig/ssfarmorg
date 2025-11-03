import React, { useState, useMemo } from 'react';
import type { Customer, Payment, Delivery } from '../types';
import Modal from './Modal';
import { PlusIcon, SearchIcon, TrashIcon } from './Icons';
import { supabase } from '../lib/supabaseClient';
import { getFriendlyErrorMessage } from '../lib/errorHandler';

interface PaymentManagerProps {
  customers: Customer[];
  payments: Payment[];
  setPayments: React.Dispatch<React.SetStateAction<Payment[]>>;
  deliveries: Delivery[];
}

interface PaymentFormProps {
    onSubmit: (payment: Omit<Payment, 'id' | 'customerId' | 'userId'>) => void;
    onClose: () => void;
    customer: Customer;
    deliveries: Delivery[];
    payments: Payment[];
    initialMonth: string;
}

const PaymentForm: React.FC<PaymentFormProps> = ({ onSubmit, onClose, customer, deliveries, payments, initialMonth }) => {
    const [amount, setAmount] = useState(0);
    const [billingMonth, setBillingMonth] = useState(initialMonth);
    const [errors, setErrors] = useState<{ [key: string]: string }>({});

    const monthlyBillDetails = useMemo(() => {
        if (!customer || !billingMonth) {
            return { previousBalance: 0, totalAmountForMonth: 0, totalPaidForMonth: 0, dueForMonth: 0 };
        }
        
        const [year, month] = billingMonth.split('-').map(Number);
        const startDate = new Date(Date.UTC(year, month - 1, 1));
        const endDate = new Date(Date.UTC(year, month, 0));

        let previousBalance = 0;
        if (customer.balanceAsOfDate && customer.previousBalance != null) {
            const openingBalanceDate = new Date(customer.balanceAsOfDate + 'T00:00:00Z');
            previousBalance = customer.previousBalance;

            const interimDeliveries = deliveries.filter(d => {
                const deliveryDate = new Date(d.date + 'T00:00:00Z');
                return d.customerId === customer.id && deliveryDate >= openingBalanceDate && deliveryDate < startDate;
            });
            const interimPayments = payments.filter(p => {
                const paymentDate = new Date(p.date + 'T00:00:00Z');
                return p.customerId === customer.id && paymentDate >= openingBalanceDate && paymentDate < startDate;
            });

            const totalInterimDue = interimDeliveries.reduce((sum, d) => sum + (d.quantity * customer.milkPrice), 0);
            const totalInterimPaid = interimPayments.reduce((sum, p) => sum + p.amount, 0);
            previousBalance += (totalInterimDue - totalInterimPaid);
        } else {
            const historicalDeliveries = deliveries.filter(d => d.customerId === customer.id && new Date(d.date + 'T00:00:00Z') < startDate);
            const historicalPayments = payments.filter(p => p.customerId === customer.id && new Date(p.date + 'T00:00:00Z') < startDate);
            const totalHistoricalDue = historicalDeliveries.reduce((sum, d) => sum + (d.quantity * customer.milkPrice), 0);
            const totalHistoricalPaid = historicalPayments.reduce((sum, p) => sum + p.amount, 0);
            previousBalance = totalHistoricalDue - totalHistoricalPaid;
        }

        const deliveriesForMonth = deliveries.filter(d => {
            const deliveryDate = new Date(d.date + 'T00:00:00Z');
            return d.customerId === customer.id && deliveryDate >= startDate && deliveryDate <= endDate;
        });
        const paymentsForMonth = payments.filter(p => {
            const paymentDate = new Date(p.date + 'T00:00:00Z');
            return p.customerId === customer.id && paymentDate >= startDate && paymentDate <= endDate;
        });

        const totalAmountForMonth = deliveriesForMonth.reduce((sum, d) => sum + (d.quantity * customer.milkPrice), 0);
        const totalPaidForMonth = paymentsForMonth.reduce((sum, p) => sum + p.amount, 0);
        
        const dueForMonth = previousBalance + totalAmountForMonth;

        return { previousBalance, totalAmountForMonth, totalPaidForMonth, dueForMonth };
    }, [customer, deliveries, payments, billingMonth]);

    React.useEffect(() => {
        const outstandingForMonth = monthlyBillDetails.dueForMonth - monthlyBillDetails.totalPaidForMonth;
        setAmount(outstandingForMonth > 0 ? parseFloat(outstandingForMonth.toFixed(2)) : 0);
    }, [monthlyBillDetails]);


    const validate = () => {
        const newErrors: { [key: string]: string } = {};
        if (amount <= 0) {
            newErrors.amount = "Amount must be greater than zero.";
        }
        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (validate()) {
            const [year, month] = billingMonth.split('-').map(Number);
            const lastDayOfMonth = new Date(Date.UTC(year, month, 0)).getDate();
            const paymentDateForMonth = `${billingMonth}-${String(lastDayOfMonth).padStart(2, '0')}`;
            onSubmit({ amount, date: paymentDateForMonth });
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <div>
                <label className="block text-sm font-medium text-gray-700">Select Billing Month</label>
                <input 
                    type="month" 
                    value={billingMonth} 
                    onChange={e => setBillingMonth(e.target.value)} 
                    required 
                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm" 
                />
            </div>

            <div className="p-3 bg-blue-50 border border-blue-200 rounded-md space-y-1">
                <h4 className="text-sm font-semibold text-gray-700 mb-2">Summary for {new Date(billingMonth + '-02').toLocaleString('default', { month: 'long', year: 'numeric' })}</h4>
                <p className="flex justify-between text-sm text-gray-600">
                    <span>Previous Balance:</span>
                    <span>₹{monthlyBillDetails.previousBalance.toFixed(2)}</span>
                </p>
                <p className="flex justify-between text-sm text-gray-600">
                    <span>Bill for this month:</span>
                    <span>+ ₹{monthlyBillDetails.totalAmountForMonth.toFixed(2)}</span>
                </p>
                <p className="flex justify-between text-sm text-gray-600 font-medium border-t pt-1 mt-1">
                    <span>Total Due before payments:</span>
                    <span>₹{monthlyBillDetails.dueForMonth.toFixed(2)}</span>
                </p>
                <p className="flex justify-between text-sm text-green-600">
                    <span>Paid this month:</span>
                    <span>- ₹{monthlyBillDetails.totalPaidForMonth.toFixed(2)}</span>
                </p>
                <p className="flex justify-between text-base font-bold text-blue-600 border-t pt-1 mt-1">
                    <span>Outstanding:</span>
                    <span>₹{(monthlyBillDetails.dueForMonth - monthlyBillDetails.totalPaidForMonth).toFixed(2)}</span>
                </p>
            </div>

            <div>
                <label className="block text-sm font-medium text-gray-700">Amount to Pay</label>
                <input type="number" step="0.01" min="0.01" value={amount} onChange={e => setAmount(e.target.value ? parseFloat(e.target.value) : 0)} required className={`mt-1 block w-full border ${errors.amount ? 'border-red-500' : 'border-gray-300'} rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm`} />
                {errors.amount && <p className="mt-1 text-xs text-red-600">{errors.amount}</p>}
            </div>
            <p className="text-xs text-gray-500 italic">Note: This payment will be recorded against the selected billing month to ensure accurate pending balance calculations.</p>
            <div className="flex justify-end pt-4 space-x-2">
                <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700">Record Payment</button>
            </div>
        </form>
    );
};

const PaymentManager: React.FC<PaymentManagerProps> = ({ customers, payments, setPayments, deliveries }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [billingMonth, setBillingMonth] = useState<string>(`${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`);
  const [viewMode, setViewMode] = useState<'pending' | 'received'>('pending');

  const customerMap = useMemo(() => new Map(customers.map(c => [c.id, c])), [customers]);

  const customerDetailsForMonth = useMemo(() => {
    return customers.map(customer => {
        const deliveriesForMonth = deliveries.filter(d => d.customerId === customer.id && d.date.startsWith(billingMonth));
        const paymentsForMonth = payments.filter(p => p.customerId === customer.id && p.date.startsWith(billingMonth));
        const totalAmountForMonth = deliveriesForMonth.reduce((s, d) => s + (d.quantity * customer.milkPrice), 0);
        const totalPaidForMonth = paymentsForMonth.reduce((s, p) => s + p.amount, 0);
        
        return { customer, totalAmountForMonth, totalPaidForMonth };
    });
  }, [billingMonth, customers, deliveries, payments]);

  const pendingPayments = useMemo(() => {
    const lowercasedFilter = searchTerm.toLowerCase().trim();
    return customerDetailsForMonth
        .filter(details => (details.totalAmountForMonth - details.totalPaidForMonth) > 0.001) // Use a small epsilon for float comparison
        .filter(details => details.customer.name.toLowerCase().includes(lowercasedFilter))
        .sort((a,b) => a.customer.name.localeCompare(b.customer.name));
  }, [customerDetailsForMonth, searchTerm]);

  const receivedPaymentsForMonth = useMemo(() => {
    const lowercasedFilter = searchTerm.toLowerCase().trim();
    return payments
        .filter(p => p.date.startsWith(billingMonth))
        .map(p => ({ ...p, customerName: customerMap.get(p.customerId)?.name || 'Unknown' }))
        .filter(p => p.customerName.toLowerCase().includes(lowercasedFilter))
        .sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [payments, billingMonth, customerMap, searchTerm]);

  const totalPendingAmount = useMemo(() => pendingPayments.reduce((sum, p) => sum + (p.totalAmountForMonth - p.totalPaidForMonth), 0), [pendingPayments]);
  const totalReceivedAmount = useMemo(() => receivedPaymentsForMonth.reduce((sum, p) => sum + p.amount, 0), [receivedPaymentsForMonth]);

  const handleAddPayment = async (paymentData: Omit<Payment, 'id' | 'customerId' | 'userId'>) => {
    if (!selectedCustomer) return;
    try {
        const newPaymentData = { ...paymentData, customerId: selectedCustomer.id };
        const { data: newPayment, error } = await supabase
            .from('payments')
            .insert(newPaymentData)
            .select()
            .single();

        if (error) throw error;
        
        if (newPayment) {
            setPayments(prev => [...prev, newPayment as Payment]);
        }
        
        setIsModalOpen(false);
        setSelectedCustomer(null);
        alert('Payment recorded successfully!');
    } catch(error: any) {
        alert(getFriendlyErrorMessage(error));
    }
  };
  
  const handleDeletePayment = async (paymentId: number, customerName: string, amount: number) => {
    if(window.confirm(`Are you sure you want to delete the payment of ₹${amount.toFixed(2)} for ${customerName}? This action cannot be undone.`)) {
        try {
            const { error } = await supabase.from('payments').delete().eq('id', paymentId);
            if (error) throw error;
            setPayments(prev => prev.filter(p => p.id !== paymentId));
            alert('Payment deleted successfully.');
        } catch(error: any) {
            alert(getFriendlyErrorMessage(error));
        }
    }
  };

  const openPaymentModal = (customer: Customer) => {
    setSelectedCustomer(customer);
    setIsModalOpen(true);
  };
  
  return (
    <div>
        <div className="flex justify-between items-center mb-6 flex-wrap gap-4">
            <h2 className="text-3xl font-bold text-gray-800">Payments</h2>
             <div className="flex items-center gap-4">
                <div className="relative">
                    <input type="text" placeholder="Search customers..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 pl-10 focus:outline-none focus:ring-blue-500 focus:border-blue-500" />
                    <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                </div>
                <input type="month" value={billingMonth} onChange={e => setBillingMonth(e.target.value)} className="w-full sm:w-auto border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500" />
            </div>
        </div>
        
        <div className="mb-6">
            <div className="border-b border-gray-200">
                <nav className="-mb-px flex space-x-8" aria-label="Tabs">
                    <button onClick={() => setViewMode('pending')} className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${viewMode === 'pending' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}>
                        Pending Payments
                    </button>
                    <button onClick={() => setViewMode('received')} className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${viewMode === 'received' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}>
                        Received Payments
                    </button>
                </nav>
            </div>
        </div>

        <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={`Record Payment for ${selectedCustomer?.name}`}>
            {selectedCustomer && (
                <PaymentForm
                    onSubmit={handleAddPayment}
                    onClose={() => setIsModalOpen(false)}
                    customer={selectedCustomer}
                    deliveries={deliveries}
                    payments={payments}
                    initialMonth={billingMonth}
                />
            )}
        </Modal>

        {viewMode === 'pending' && (
            <div>
                <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                    <h3 className="text-lg font-semibold text-red-800">Total Pending for {new Date(billingMonth + '-02').toLocaleString('default', { month: 'long' })}</h3>
                    <p className="text-2xl font-bold text-red-600">₹{totalPendingAmount.toFixed(2)}</p>
                </div>
                <div className="bg-white shadow-md rounded-lg overflow-hidden">
                    {pendingPayments.length > 0 ? (
                        <table className="w-full text-sm text-left text-gray-500">
                             <thead className="text-xs text-gray-700 uppercase bg-gray-50">
                                <tr>
                                    <th scope="col" className="px-6 py-3">Customer</th>
                                    <th scope="col" className="px-6 py-3">Pending for Month</th>
                                    <th scope="col" className="px-6 py-3 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {pendingPayments.map(({ customer, totalAmountForMonth, totalPaidForMonth }) => (
                                    <tr key={customer.id} className="bg-white border-b hover:bg-gray-50">
                                        <td className="px-6 py-4 font-medium text-gray-900">{customer.name}</td>
                                        <td className="px-6 py-4 font-semibold text-red-600">₹{(totalAmountForMonth - totalPaidForMonth).toFixed(2)}</td>
                                        <td className="px-6 py-4 text-right">
                                            <button onClick={() => openPaymentModal(customer)} className="flex items-center ml-auto px-3 py-1.5 text-sm bg-green-600 text-white rounded-md shadow-sm hover:bg-green-700">
                                                <PlusIcon className="h-4 w-4 mr-1"/> Record Payment
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    ) : (
                        <div className="text-center py-12 px-6"><h3 className="text-lg font-medium text-gray-700">All Clear!</h3><p className="mt-1 text-sm text-gray-500">No pending payments for this month.</p></div>
                    )}
                </div>
            </div>
        )}

        {viewMode === 'received' && (
            <div>
                <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg">
                    <h3 className="text-lg font-semibold text-green-800">Total Received in {new Date(billingMonth + '-02').toLocaleString('default', { month: 'long' })}</h3>
                    <p className="text-2xl font-bold text-green-600">₹{totalReceivedAmount.toFixed(2)}</p>
                </div>
                <div className="bg-white shadow-md rounded-lg overflow-hidden">
                    {receivedPaymentsForMonth.length > 0 ? (
                        <table className="w-full text-sm text-left text-gray-500">
                             <thead className="text-xs text-gray-700 uppercase bg-gray-50">
                                <tr>
                                    <th className="px-6 py-3">Date</th>
                                    <th className="px-6 py-3">Customer</th>
                                    <th className="px-6 py-3">Amount Paid</th>
                                    <th className="px-6 py-3 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {receivedPaymentsForMonth.map((payment) => (
                                    <tr key={payment.id} className="bg-white border-b hover:bg-gray-50">
                                        <td className="px-6 py-4 text-gray-700">{new Date(payment.date + 'T00:00:00Z').toLocaleDateString('en-GB', {timeZone: 'UTC'})}</td>
                                        <td className="px-6 py-4 font-medium text-gray-900">{payment.customerName}</td>
                                        <td className="px-6 py-4 font-semibold text-green-600">₹{payment.amount.toFixed(2)}</td>
                                        <td className="px-6 py-4 text-right">
                                            <button onClick={() => handleDeletePayment(payment.id, payment.customerName, payment.amount)} className="text-red-500 hover:text-red-700" title="Delete Payment">
                                                <TrashIcon className="h-5 w-5"/>
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    ) : (
                        <div className="text-center py-12 px-6"><h3 className="text-lg font-medium text-gray-700">No Payments Recorded</h3><p className="mt-1 text-sm text-gray-500">No payments were received for this month.</p></div>
                    )}
                </div>
            </div>
        )}
    </div>
  );
};

export default PaymentManager;
