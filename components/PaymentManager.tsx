import React, { useState, useMemo, useEffect } from 'react';
import type { Customer, Payment, Delivery } from '../types';
import Modal from './Modal';
import { PlusIcon, SearchIcon } from './Icons';
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
    outstandingBalance: number;
}

const PaymentForm: React.FC<PaymentFormProps> = ({ onSubmit, onClose, outstandingBalance }) => {
    const [amount, setAmount] = useState(0);
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [errors, setErrors] = useState<{ [key: string]: string }>({});

    useEffect(() => {
        if (outstandingBalance > 0) {
            setAmount(parseFloat(outstandingBalance.toFixed(2)));
        } else {
            setAmount(0);
        }
    }, [outstandingBalance]);

    const validate = () => {
        const newErrors: { [key: string]: string } = {};
        if (amount <= 0) {
            newErrors.amount = "Amount must be greater than zero.";
        }
        if (!date) {
            newErrors.date = "A valid date is required.";
        }
        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (validate()) {
            onSubmit({ amount, date });
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            {outstandingBalance > 0 && (
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-md text-center">
                    <p className="text-sm text-gray-600">Current Outstanding Balance:</p>
                    <p className="text-xl font-bold text-blue-600">₹{outstandingBalance.toFixed(2)}</p>
                </div>
            )}
            <div>
                <label className="block text-sm font-medium text-gray-700">Amount to Pay</label>
                <input type="number" step="0.01" min="0.01" value={amount} onChange={e => setAmount(e.target.value ? parseFloat(e.target.value) : 0)} required className={`mt-1 block w-full border ${errors.amount ? 'border-red-500' : 'border-gray-300'} rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm`} />
                {errors.amount && <p className="mt-1 text-xs text-red-600">{errors.amount}</p>}
            </div>
            <div>
                <label className="block text-sm font-medium text-gray-700">Payment Date</label>
                <input type="date" value={date} onChange={e => setDate(e.target.value)} required className={`mt-1 block w-full border ${errors.date ? 'border-red-500' : 'border-gray-300'} rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm`} />
                {errors.date && <p className="mt-1 text-xs text-red-600">{errors.date}</p>}
            </div>
            <div className="flex justify-end pt-4 space-x-2">
                <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700">Record Payment</button>
            </div>
        </form>
    );
};

type CustomerWithBalance = Customer & { balance: number };

const PaymentManager: React.FC<PaymentManagerProps> = ({ customers, payments, setPayments, deliveries }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerWithBalance | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const customerBalances = useMemo(() => {
    return customers.map(customer => {
      let balance = 0;
      if (customer.balanceAsOfDate && customer.previousBalance != null) {
          const openingBalanceDate = new Date(customer.balanceAsOfDate + 'T00:00:00Z');
          const subsequentDeliveries = deliveries.filter(d => d.customerId === customer.id && new Date(d.date + 'T00:00:00Z') >= openingBalanceDate);
          const subsequentPayments = payments.filter(p => p.customerId === customer.id && new Date(p.date + 'T00:00:00Z') >= openingBalanceDate);

          const totalSubsequentDue = subsequentDeliveries.reduce((sum, d) => sum + (d.quantity * customer.milkPrice), 0);
          const totalSubsequentPaid = subsequentPayments.reduce((sum, p) => sum + p.amount, 0);

          balance = customer.previousBalance + totalSubsequentDue - totalSubsequentPaid;
      } else {
          // Fallback to full calculation
          const totalDue = deliveries
            .filter(d => d.customerId === customer.id)
            .reduce((sum, d) => sum + (d.quantity * customer.milkPrice), 0);
          
          const totalPaid = payments
            .filter(p => p.customerId === customer.id)
            .reduce((sum, p) => sum + p.amount, 0);
          balance = totalDue - totalPaid;
      }

      return {
        ...customer,
        balance,
      };
    }).sort((a, b) => a.name.localeCompare(b.name));
  }, [customers, deliveries, payments]);

  const filteredCustomerBalances = useMemo(() => {
    if (!searchTerm.trim()) {
      return customerBalances;
    }
    const lowercasedFilter = searchTerm.toLowerCase();
    return customerBalances.filter(customer =>
      customer.name.toLowerCase().includes(lowercasedFilter)
    );
  }, [customerBalances, searchTerm]);

  const handleAddPayment = async (paymentData: Omit<Payment, 'id' | 'customerId' | 'userId'>) => {
    if (!selectedCustomer) return;

    try {
        const newPaymentData = {
            ...paymentData,
            customerId: selectedCustomer.id,
        };

        const { error } = await supabase.from('payments').insert(newPaymentData);
        if (error) throw error;
        
        // Re-fetch all payments to ensure UI consistency
        const { data: updatedPayments, error: refetchError } = await supabase
            .from('payments')
            .select('*');
            
        if (refetchError) {
            throw new Error(`Payment was saved, but failed to refresh data: ${refetchError.message}. Please refresh the page.`);
        }

        setPayments(updatedPayments || []);
        
        setIsModalOpen(false);
        setSelectedCustomer(null);
        alert('Payment recorded successfully!');

    } catch(error: any) {
        alert(getFriendlyErrorMessage(error));
    }
  };
  
  const openPaymentModal = (customer: CustomerWithBalance) => {
    setSelectedCustomer(customer);
    setIsModalOpen(true);
  };
  
  return (
    <div>
        <div className="flex justify-between items-center mb-6 flex-wrap gap-4">
            <h2 className="text-3xl font-bold text-gray-800">Payments</h2>
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
        </div>

        <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={`Record Payment for ${selectedCustomer?.name}`}>
            <PaymentForm
                onSubmit={handleAddPayment}
                onClose={() => setIsModalOpen(false)}
                outstandingBalance={selectedCustomer?.balance || 0}
            />
        </Modal>

        <div className="bg-white shadow-md rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
                {customers.length > 0 ? (
                    filteredCustomerBalances.length > 0 ? (
                        <table className="w-full text-sm text-left text-gray-500">
                            <thead className="text-xs text-gray-700 uppercase bg-gray-50">
                                <tr>
                                    <th scope="col" className="px-6 py-3">Customer</th>
                                    <th scope="col" className="px-6 py-3">Outstanding Balance</th>
                                    <th scope="col" className="px-6 py-3 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredCustomerBalances.map(customer => (
                                    <tr key={customer.id} className="bg-white border-b hover:bg-gray-50">
                                        <th scope="row" className="px-6 py-4 font-medium text-gray-900 whitespace-nowrap">
                                            {customer.name}
                                        </th>
                                        <td className={`px-6 py-4 font-semibold ${customer.balance > 0 ? 'text-red-600' : 'text-green-600'}`}>
                                            ₹{customer.balance.toFixed(2)}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <button onClick={() => openPaymentModal(customer)} className="flex items-center ml-auto px-3 py-1.5 text-sm bg-green-600 text-white rounded-md shadow-sm hover:bg-green-700 transition-colors">
                                                <PlusIcon className="h-4 w-4 mr-1"/>
                                                Record Payment
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    ) : (
                        <div className="text-center py-12 px-6">
                            <h3 className="text-lg font-medium text-gray-700">No Customers Match Your Search</h3>
                            <p className="mt-1 text-sm text-gray-500">Try a different name.</p>
                        </div>
                    )
                 ) : (
                    <div className="text-center py-12 px-6">
                        <h3 className="text-lg font-medium text-gray-700">No Customers Found</h3>
                        <p className="mt-1 text-sm text-gray-500">Add customers to manage their payments.</p>
                    </div>
                )}
            </div>
        </div>
    </div>
  );
};

export default PaymentManager;