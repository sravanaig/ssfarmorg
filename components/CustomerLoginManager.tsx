
import React, { useState, useMemo } from 'react';
import type { Customer } from '../types';
import { supabase } from '../lib/supabaseClient';
import { SearchIcon, KeyIcon, LockIcon, SpinnerIcon, TrashIcon, CheckIcon } from './Icons';
import Modal from './Modal';
import { getFriendlyErrorMessage } from '../lib/errorHandler';

interface CustomerLoginManagerProps {
  customers: Customer[];
  setCustomers: React.Dispatch<React.SetStateAction<Customer[]>>;
}

const CustomerLoginManager: React.FC<CustomerLoginManagerProps> = ({ customers, setCustomers }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  // Robust filtering that handles nulls/undefined safely
  const filteredCustomers = useMemo(() => {
    if (!customers || !Array.isArray(customers)) return [];
    if (!searchTerm.trim()) return customers;
    
    const lowerFilter = searchTerm.toLowerCase();
    
    return customers.filter(c => {
        if (!c) return false;
        const name = c.name ? c.name.toLowerCase() : '';
        const phone = c.phone ? c.phone.toLowerCase() : '';
        return name.includes(lowerFilter) || phone.includes(lowerFilter);
    });
  }, [customers, searchTerm]);

  const handleOpenModal = (customer: Customer) => {
    setSelectedCustomer(customer);
    // Pre-fill default password logic
    if (customer.phone && customer.phone.length >= 10) {
        const cleanPhone = customer.phone.replace(/\D/g, '').slice(-10);
        setPassword(cleanPhone + "*");
    } else {
        setPassword('');
    }
    setSuccessMessage('');
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedCustomer(null);
    setPassword('');
    setSuccessMessage('');
  };

  const handleSaveLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer) return;
    
    setIsSubmitting(true);
    try {
        const { data: userId, error } = await supabase.rpc('admin_set_customer_password', {
            p_customer_id: selectedCustomer.id,
            p_password: password
        });

        if (error) throw error;

        setCustomers(prev => prev.map(c => 
            c.id === selectedCustomer.id ? { ...c, userId: userId } : c
        ));
        
        setSuccessMessage(`Success! Password set to: ${password}`);
        setTimeout(() => {
            handleCloseModal();
        }, 1500);

    } catch (error: any) {
        alert(getFriendlyErrorMessage(error));
    } finally {
        setIsSubmitting(false);
    }
  };

  const handleDeleteLogin = async (customer: Customer) => {
    if (!window.confirm(`Are you sure you want to remove login access for ${customer.name}? The customer will no longer be able to sign in.`)) return;

    try {
        const { error } = await supabase.rpc('admin_delete_customer_login', {
            p_customer_id: customer.id
        });

        if (error) throw error;

        setCustomers(prev => prev.map(c => 
            c.id === customer.id ? { ...c, userId: undefined } : c
        ));
        alert('Login access revoked.');

    } catch (error: any) {
        alert(getFriendlyErrorMessage(error));
    }
  };

  if (!customers) {
      return <div className="p-8 text-center text-gray-500">Loading customers...</div>;
  }

  return (
    <div>
        <div className="flex flex-col md:flex-row justify-between md:items-center mb-6 gap-4">
            <h2 className="text-3xl font-bold text-gray-800">Customer Login Management</h2>
            <div className="relative w-full md:w-64">
                <input
                    type="text"
                    placeholder="Search customers..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg shadow-sm py-2 px-3 pl-10 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                />
                <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
            </div>
        </div>

        <div className="bg-white shadow-md rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
                <table className="w-full text-sm text-left text-gray-500">
                    <thead className="text-xs text-gray-700 uppercase bg-gray-50">
                        <tr>
                            <th scope="col" className="px-6 py-3">Customer Name</th>
                            <th scope="col" className="px-6 py-3">Mobile (Login ID)</th>
                            <th scope="col" className="px-6 py-3">Status</th>
                            <th scope="col" className="px-6 py-3">Login Status</th>
                            <th scope="col" className="px-6 py-3 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredCustomers.length > 0 ? (
                            filteredCustomers.map(customer => (
                                <tr key={customer.id} className="bg-white border-b hover:bg-gray-50">
                                    <td className="px-6 py-4 font-medium text-gray-900">{customer.name}</td>
                                    <td className="px-6 py-4">{customer.phone || 'N/A'}</td>
                                    <td className="px-6 py-4">
                                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full capitalize ${
                                            customer.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                                        }`}>
                                            {customer.status}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4">
                                        {customer.userId ? (
                                            <span className="flex items-center text-green-600 font-medium">
                                                <KeyIcon className="h-4 w-4 mr-1" /> Active
                                            </span>
                                        ) : (
                                            <span className="flex items-center text-gray-400">
                                                <LockIcon className="h-4 w-4 mr-1" /> No Login
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <div className="flex justify-end gap-2">
                                            <button 
                                                onClick={() => handleOpenModal(customer)}
                                                className={`px-3 py-1.5 text-xs text-white rounded-md shadow-sm transition-colors ${customer.userId ? 'bg-blue-500 hover:bg-blue-600' : 'bg-green-600 hover:bg-green-700'}`}
                                            >
                                                {customer.userId ? 'Reset Password' : 'Create Login'}
                                            </button>
                                            {customer.userId && (
                                                <button 
                                                    onClick={() => handleDeleteLogin(customer)}
                                                    className="px-3 py-1.5 text-xs bg-red-100 text-red-600 rounded-md hover:bg-red-200 transition-colors"
                                                    title="Revoke Login Access"
                                                >
                                                    <TrashIcon className="h-4 w-4" />
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))
                        ) : (
                            <tr>
                                <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                                    {customers.length === 0 
                                        ? "No customers found in the database." 
                                        : "No customers found matching your search."}
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>

        <Modal isOpen={isModalOpen} onClose={handleCloseModal} title={selectedCustomer?.userId ? `Reset Password` : `Create Login`}>
            <form onSubmit={handleSaveLogin} className="space-y-4">
                {successMessage ? (
                    <div className="p-4 bg-green-100 text-green-700 rounded-md flex items-center justify-center">
                        <CheckIcon className="h-5 w-5 mr-2" /> {successMessage}
                    </div>
                ) : (
                    <>
                        <div className="bg-blue-50 p-4 rounded-md mb-4">
                            <p className="text-sm text-blue-800">
                                <strong>Customer:</strong> {selectedCustomer?.name}<br/>
                                <strong>Login ID:</strong> {selectedCustomer?.phone || 'No phone set'}
                            </p>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Password</label>
                            <input 
                                type="text" 
                                value={password} 
                                onChange={e => setPassword(e.target.value)}
                                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:ring-blue-500 focus:border-blue-500"
                                required
                                minLength={6}
                            />
                            <p className="mt-1 text-xs text-gray-500">Default pattern: Phone Number + *</p>
                        </div>
                        <div className="flex justify-end pt-4 space-x-2 border-t mt-4">
                            <button type="button" onClick={handleCloseModal} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300">Cancel</button>
                            <button type="submit" disabled={isSubmitting} className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50">
                                {isSubmitting && <SpinnerIcon className="animate-spin h-4 w-4 mr-2" />}
                                {selectedCustomer?.userId ? 'Reset Password' : 'Create Login'}
                            </button>
                        </div>
                    </>
                )}
            </form>
        </Modal>
    </div>
  );
};

export default CustomerLoginManager;
