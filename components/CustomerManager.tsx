

import React, { useState, useEffect, useRef } from 'react';
import type { Customer } from '../types';
import Modal from './Modal';
import { PlusIcon, EditIcon, TrashIcon, UploadIcon, DownloadIcon, ClipboardIcon, CheckIcon } from './Icons';
import { supabase } from '../lib/supabaseClient';

interface CustomerManagerProps {
  customers: Customer[];
  setCustomers: React.Dispatch<React.SetStateAction<Customer[]>>;
  projectRef: string | null;
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

const CustomerForm: React.FC<{
    onSubmit: (customer: Omit<Customer, 'id' | 'userId'>) => void;
    onClose: () => void;
    customerToEdit?: Customer | null;
}> = ({ onSubmit, onClose, customerToEdit }) => {
    const [name, setName] = useState('');
    const [address, setAddress] = useState('');
    const [phone, setPhone] = useState('');
    const [defaultQuantity, setDefaultQuantity] = useState(1);
    const [errors, setErrors] = useState<{ [key: string]: string }>({});

    useEffect(() => {
        if (customerToEdit) {
            setName(customerToEdit.name);
            setAddress(customerToEdit.address);
            setPhone(customerToEdit.phone);
            setDefaultQuantity(customerToEdit.defaultQuantity);
        } else {
            setName('');
            setAddress('');
            setPhone('');
            setDefaultQuantity(1);
        }
        setErrors({});
    }, [customerToEdit]);

    const validate = () => {
        const newErrors: { [key: string]: string } = {};
        if (!name.trim()) newErrors.name = "Name is required.";
        if (!address.trim()) newErrors.address = "Address is required.";
        if (phone && !/^\+?[\d\s-]{10,15}$/.test(phone)) {
            newErrors.phone = "Please enter a valid phone number.";
        }
        if (defaultQuantity <= 0) newErrors.defaultQuantity = "Quantity must be a positive number.";
        
        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };


    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (validate()) {
            onSubmit({ name, address, phone, milkPrice: 90, defaultQuantity });
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <div>
                <label className="block text-sm font-medium text-gray-700">Name</label>
                <input type="text" value={name} onChange={e => setName(e.target.value)} required className={`mt-1 block w-full border ${errors.name ? 'border-red-500' : 'border-gray-300'} rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm`} />
                {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name}</p>}
            </div>
            <div>
                <label className="block text-sm font-medium text-gray-700">Address</label>
                <input type="text" value={address} onChange={e => setAddress(e.target.value)} required className={`mt-1 block w-full border ${errors.address ? 'border-red-500' : 'border-gray-300'} rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm`} />
                {errors.address && <p className="mt-1 text-xs text-red-600">{errors.address}</p>}
            </div>
            <div>
                <label className="block text-sm font-medium text-gray-700">Phone</label>
                <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} className={`mt-1 block w-full border ${errors.phone ? 'border-red-500' : 'border-gray-300'} rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm`} />
                {errors.phone && <p className="mt-1 text-xs text-red-600">{errors.phone}</p>}
            </div>
            <div>
                <label className="block text-sm font-medium text-gray-700">Default Quantity</label>
                <select
                    value={defaultQuantity}
                    onChange={e => setDefaultQuantity(parseFloat(e.target.value))}
                    required
                    className={`mt-1 block w-full border ${errors.defaultQuantity ? 'border-red-500' : 'border-gray-300'} rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm`}
                >
                    <option value={0.5}>1/2 liter</option>
                    <option value={1}>1 liter</option>
                    <option value={1.5}>1 1/2 liter</option>
                    <option value={2}>2 liter</option>
                    <option value={2.5}>2 1/2 liter</option>
                    <option value={3}>3 liter</option>
                </select>
                {errors.defaultQuantity && <p className="mt-1 text-xs text-red-600">{errors.defaultQuantity}</p>}
            </div>
            <div className="flex justify-end pt-4 space-x-2">
                <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700">{customerToEdit ? 'Update' : 'Add'} Customer</button>
            </div>
        </form>
    );
};

const CustomerManager: React.FC<CustomerManagerProps> = ({ customers, setCustomers, projectRef }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [customerToEdit, setCustomerToEdit] = useState<Customer | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [copiedSql, setCopiedSql] = useState(false);

  const migrationSql = `-- This script assigns existing customers (that don't have an owner) to your user account.\n-- It's safe to run multiple times.\nUPDATE public.customers SET "userId" = auth.uid() WHERE "userId" IS NULL;`;

  const handleCopySql = () => {
      navigator.clipboard.writeText(migrationSql);
      setCopiedSql(true);
      setTimeout(() => setCopiedSql(false), 2000);
  };

  const handleAddCustomer = async (customerData: Omit<Customer, 'id' | 'userId'>) => {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("You must be logged in to add a customer.");

        const { data, error } = await supabase
            .from('customers')
            .insert({ ...customerData, userId: user.id })
            .select()
            .single();

        if (error) throw error;
        
        if (data) {
            setCustomers(prev => [...prev, data as Customer].sort((a,b) => a.name.localeCompare(b.name)));
        }
        setIsModalOpen(false);
    } catch (error: any) {
        alert(`Error: ${error.message}`);
    }
  };

  const handleEditCustomer = async (customerData: Omit<Customer, 'id' | 'userId'>) => {
    if (!customerToEdit) return;
    try {
      const { data, error } = await supabase
        .from('customers')
        .update(customerData)
        .eq('id', customerToEdit.id)
        .select()
        .single();
      
      if (error) throw error;

      if(data) {
        const updatedCustomer = data as Customer;
        setCustomers(prev => prev.map(c => c.id === updatedCustomer.id ? updatedCustomer : c));
      }
      setCustomerToEdit(null);
      setIsModalOpen(false);
    } catch (error: any) {
      alert(`Error: ${error.message}`);
    }
  };

  const handleDeleteCustomer = async (id: number) => {
    if (window.confirm('Are you sure you want to delete this customer? This action cannot be undone.')) {
        try {
            // Also delete related deliveries and payments
            await supabase.from('deliveries').delete().eq('customerId', id);
            await supabase.from('payments').delete().eq('customerId', id);
            const { error } = await supabase.from('customers').delete().eq('id', id);
            if (error) throw error;
            setCustomers(prev => prev.filter(c => c.id !== id));
        } catch (error: any) {
            alert(`Error: ${error.message}`);
        }
    }
  };

  const openEditModal = (customer: Customer) => {
    setCustomerToEdit(customer);
    setIsModalOpen(true);
  };

  const openAddModal = () => {
    setCustomerToEdit(null);
    setIsModalOpen(true);
  };

  const handleExport = () => {
    const headers = ['name', 'address', 'phone', 'milkPrice', 'defaultQuantity'];
    const csvRows = [
        headers.join(','),
        ...customers.map(c => headers.map(h => c[h as keyof Omit<Customer, 'id' | 'userId'>]).join(','))
    ];
    downloadCSV(csvRows.join('\n'), 'customers.csv');
  };
  
  const handleDownloadTemplate = () => {
    const headers = 'name,address,phone,milkPrice,defaultQuantity';
    downloadCSV(headers, 'customer_template.csv');
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };
  
  const processAndImportCustomers = async (csvText: string) => {
        const rows = csvText.split('\n').filter(row => row.trim() !== '');
        if (rows.length < 2) {
            throw new Error("CSV data is empty or contains only a header.");
        }
        
        const header = rows[0].split(',').map(h => h.trim());
        const requiredHeaders = ['name', 'address', 'phone', 'milkPrice', 'defaultQuantity'];
        if (!requiredHeaders.every(h => header.includes(h))) {
            throw new Error(`Invalid CSV header. Required headers are: ${requiredHeaders.join(', ')}`);
        }

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("You must be logged in to import customers.");
        
        const newCustomersData = rows.slice(1).map(row => {
            const values = row.split(',');
            // Helper to safely get value from CSV row, preventing errors on malformed rows
            const getColumnValue = (columnName: string) => values[header.indexOf(columnName)] || '';

            return {
                name: getColumnValue('name').trim(),
                address: getColumnValue('address').trim(),
                phone: getColumnValue('phone').trim().replace('?',''),
                milkPrice: parseFloat(getColumnValue('milkPrice')) || 0,
                defaultQuantity: parseFloat(getColumnValue('defaultQuantity')) || 0,
                userId: user.id,
            };
        }).filter(customer => customer.name); // Filter out empty rows that might result from newlines

        if (newCustomersData.length === 0) {
            alert("No valid customer data found to import.");
            return;
        }

        const { data, error } = await supabase.from('customers').insert(newCustomersData).select();
        if (error) throw error;

        if (data) {
            setCustomers(prev => [...prev, ...data as Customer[]].sort((a,b) => a.name.localeCompare(b.name)));
            alert(`${data.length} customers imported successfully.`);
        }
  }

  const handleFileImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const text = e.target?.result as string;
            await processAndImportCustomers(text);
        } catch (error: any) {
            alert("An error occurred while importing the file: " + error.message);
            console.error(error);
        } finally {
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
        }
    };
    reader.readAsText(file);
  };

  return (
    <div>
        <div className="flex justify-between items-center mb-6 flex-wrap gap-4">
            <h2 className="text-3xl font-bold text-gray-800">Customers</h2>
            <div className="flex items-center gap-2 flex-wrap">
                <input type="file" accept=".csv" ref={fileInputRef} onChange={handleFileImport} className="hidden" />
                <button onClick={handleImportClick} className="flex items-center px-3 py-2 text-sm bg-gray-600 text-white rounded-lg shadow-sm hover:bg-gray-700 transition-colors">
                    <UploadIcon className="h-4 w-4 mr-2"/> Import
                </button>
                <button onClick={handleExport} className="flex items-center px-3 py-2 text-sm bg-gray-600 text-white rounded-lg shadow-sm hover:bg-gray-700 transition-colors">
                    <DownloadIcon className="h-4 w-4 mr-2"/> Export
                </button>
                <button onClick={handleDownloadTemplate} className="flex items-center px-3 py-2 text-sm text-gray-600 border rounded-lg hover:bg-gray-100 transition-colors">
                    Template
                </button>
                <button onClick={openAddModal} className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg shadow-sm hover:bg-blue-700 transition-colors">
                    <PlusIcon className="h-5 w-5 mr-2"/>
                    Add Customer
                </button>
            </div>
        </div>

        <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={customerToEdit ? 'Edit Customer' : 'Add New Customer'}>
            <CustomerForm
                onSubmit={customerToEdit ? handleEditCustomer : handleAddCustomer}
                onClose={() => setIsModalOpen(false)}
                customerToEdit={customerToEdit}
            />
        </Modal>

        <div className="bg-white shadow-md rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
                {customers.length > 0 ? (
                <table className="w-full text-sm text-left text-gray-500">
                    <thead className="text-xs text-gray-700 uppercase bg-gray-50">
                        <tr>
                            <th scope="col" className="px-6 py-3">Name</th>
                            <th scope="col" className="px-6 py-3">Address</th>
                            <th scope="col" className="px-6 py-3">Phone</th>
                            <th scope="col" className="px-6 py-3">Price</th>
                            <th scope="col" className="px-6 py-3">Default Qty</th>
                            <th scope="col" className="px-6 py-3 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {customers.map(customer => (
                            <tr key={customer.id} className="bg-white border-b hover:bg-gray-50">
                                <th scope="row" className="px-6 py-4 font-medium text-gray-900 whitespace-nowrap">{customer.name}</th>
                                <td className="px-6 py-4">{customer.address}</td>
                                <td className="px-6 py-4">{customer.phone}</td>
                                <td className="px-6 py-4">₹{customer.milkPrice.toFixed(2)}</td>
                                <td className="px-6 py-4">{customer.defaultQuantity} L</td>
                                <td className="px-6 py-4 text-right">
                                    <button onClick={() => openEditModal(customer)} className="text-blue-600 hover:text-blue-800 mr-4"><EditIcon className="w-5 h-5"/></button>
                                    <button onClick={() => handleDeleteCustomer(customer.id)} className="text-red-600 hover:text-red-800"><TrashIcon className="w-5 h-5"/></button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                ) : (
                    <div className="text-center py-12 px-6">
                        <h3 className="text-lg font-medium text-gray-700">No Customers Found</h3>
                        <p className="mt-1 text-sm text-gray-500">Get started by adding a new customer or importing from a CSV file.</p>
                        <div className="mt-4">
                            <button onClick={openAddModal} className="flex items-center mx-auto px-4 py-2 bg-blue-600 text-white rounded-lg shadow-sm hover:bg-blue-700 transition-colors">
                                <PlusIcon className="h-5 w-5 mr-2"/>
                                Add Customer
                            </button>
                        </div>
                        <div className="mt-8 border-t pt-6">
                            <button onClick={() => setShowHelp(!showHelp)} className="text-sm text-blue-600 hover:underline">
                                Trouble seeing existing customers?
                            </button>
                            {showHelp && (
                                <div className="mt-4 p-4 bg-gray-50 rounded-lg text-left max-w-2xl mx-auto">
                                    <p className="text-sm text-gray-700 mb-2">If you added customers before setting up user accounts, you may need to assign them to your user. Run the following SQL script in your Supabase project to fix this.</p>
                                    <div className="relative">
                                        <pre className="bg-gray-800 text-white p-4 rounded-md text-xs overflow-x-auto">
                                            {migrationSql}
                                        </pre>
                                        <button onClick={handleCopySql} className="absolute top-2 right-2 flex items-center px-2 py-1 text-xs bg-gray-600 text-white rounded hover:bg-gray-500">
                                            {copiedSql ? <CheckIcon className="h-4 w-4 mr-1 text-green-400" /> : <ClipboardIcon className="h-4 w-4 mr-1" />}
                                            {copiedSql ? 'Copied!' : 'Copy Script'}
                                        </button>
                                    </div>
                                    <div className="mt-4 flex flex-col sm:flex-row items-center justify-center gap-4">
                                        <a href={projectRef ? `https://supabase.com/dashboard/project/${projectRef}/sql/new` : 'https://supabase.com/dashboard'} target="_blank" rel="noopener noreferrer" className="px-4 py-2 bg-green-600 text-white font-bold rounded-lg shadow-md hover:bg-green-700 text-sm">
                                            Open Supabase SQL Editor
                                        </a>
                                        <button 
                                            onClick={() => window.location.reload()}
                                            className="px-4 py-2 bg-blue-600 text-white font-bold rounded-lg shadow-md hover:bg-blue-700 text-sm"
                                        >
                                            Refresh Page
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    </div>
  );
};

export default CustomerManager;