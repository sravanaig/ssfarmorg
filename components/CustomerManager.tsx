
import React, { useState, useEffect, useMemo, useRef } from 'react';
import type { Customer, Profile } from '../types';
import Modal from './Modal';
import { PlusIcon, EditIcon, TrashIcon, UploadIcon, DownloadIcon, CheckIcon, SearchIcon, SpinnerIcon, MapPinIcon } from './Icons';
import { supabase } from '../lib/supabaseClient';
import { getFriendlyErrorMessage } from '../lib/errorHandler';

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

interface CustomerFormProps {
    onSubmit: (customer: Omit<Customer, 'id' | 'userId'>) => void;
    onClose: () => void;
    customerToEdit?: Customer | null;
    isSubmitting: boolean;
    onResetPassword: (newPassword: string) => Promise<{success: boolean}>;
}

const CustomerForm: React.FC<CustomerFormProps> = ({ onSubmit, onClose, customerToEdit, isSubmitting, onResetPassword }) => {
    const [name, setName] = useState('');
    const [address, setAddress] = useState('');
    const [phone, setPhone] = useState('');
    const [email, setEmail] = useState('');
    const [milkPrice, setMilkPrice] = useState(90);
    const [defaultQuantity, setDefaultQuantity] = useState(1);
    const [status, setStatus] = useState<'active' | 'inactive'>('active');
    const [previousBalance, setPreviousBalance] = useState(0);
    const [balanceAsOfDate, setBalanceAsOfDate] = useState('');
    const [locationLat, setLocationLat] = useState<number | undefined>(undefined);
    const [locationLng, setLocationLng] = useState<number | undefined>(undefined);
    const [isLocating, setIsLocating] = useState(false);
    
    const [errors, setErrors] = useState<{ [key: string]: string }>({});

    const [isResetPasswordModalOpen, setIsResetPasswordModalOpen] = useState(false);
    const [newPassword, setNewPassword] = useState('');
    const [isResetting, setIsResetting] = useState(false);
    const [resetError, setResetError] = useState('');
    
    // Ref to track which customer we are editing to prevent overwriting form data 
    // when the parent component updates the customer object (e.g., after creating a login)
    const prevCustomerIdRef = useRef<string | null>(null);

    useEffect(() => {
        if (customerToEdit) {
            // Only reset form fields if we switched to a different customer.
            // This preserves unsaved edits if the parent updates the same customer object (e.g. adding userId).
            if (prevCustomerIdRef.current !== customerToEdit.id) {
                setName(customerToEdit.name);
                setAddress(customerToEdit.address);
                setPhone(customerToEdit.phone ? customerToEdit.phone.replace('+91', '') : '');
                setEmail(customerToEdit.email || '');
                setMilkPrice(customerToEdit.milkPrice);
                setDefaultQuantity(customerToEdit.defaultQuantity);
                setStatus(customerToEdit.status || 'active');
                setPreviousBalance(customerToEdit.previousBalance || 0);
                setBalanceAsOfDate(customerToEdit.balanceAsOfDate || '');
                setLocationLat(customerToEdit.locationLat);
                setLocationLng(customerToEdit.locationLng);
                prevCustomerIdRef.current = customerToEdit.id;
            }
        } else {
            setName('');
            setAddress('');
            setPhone('');
            setEmail('');
            setMilkPrice(90);
            setDefaultQuantity(1);
            setStatus('active');
            setPreviousBalance(0);
            setBalanceAsOfDate('');
            setLocationLat(undefined);
            setLocationLng(undefined);
            prevCustomerIdRef.current = null;
        }
        setErrors({});
    }, [customerToEdit]);

    const validate = () => {
        const newErrors: { [key: string]: string } = {};
        if (!name.trim()) newErrors.name = "Name is required.";
        if (!address.trim()) newErrors.address = "Address is required.";
        if (phone && !/^\d{10}$/.test(phone)) {
            newErrors.phone = "Please enter a valid 10-digit mobile number.";
        }
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (email && !emailRegex.test(email)) {
             newErrors.email = "Please enter a valid email address.";
        }
        if (milkPrice <= 0) newErrors.milkPrice = "Price must be a positive number.";
        if (defaultQuantity <= 0) newErrors.defaultQuantity = "Quantity must be a positive number.";
        if (!customerToEdit && previousBalance !== 0 && !balanceAsOfDate) {
            newErrors.balanceAsOfDate = "Date is required if opening balance is not zero.";
        }
        
        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };


    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (validate()) {
            const formattedPhone = phone ? `+91${phone.replace(/\D/g, '').slice(-10)}` : '';
            onSubmit({ 
                name, 
                address, 
                phone: formattedPhone, 
                email, 
                milkPrice, 
                defaultQuantity, 
                status, 
                previousBalance, 
                balanceAsOfDate: balanceAsOfDate || null,
                locationLat,
                locationLng
            });
        }
    };

    const handleResetSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        e.stopPropagation(); // STOP event from bubbling up to the parent form
        
        setResetError('');
        const cleanPassword = newPassword.trim();
        if (cleanPassword.length < 6) {
            setResetError('Password must be at least 6 characters long.');
            return;
        }
        setIsResetting(true);
        const { success } = await onResetPassword(cleanPassword);
        setIsResetting(false);
        if (success) {
            setNewPassword('');
            setIsResetPasswordModalOpen(false);
        }
    };

    const handleGetLocation = () => {
        if (!navigator.geolocation) {
            alert('Geolocation is not supported by your browser');
            return;
        }

        setIsLocating(true);
        navigator.geolocation.getCurrentPosition(
            (position) => {
                setLocationLat(position.coords.latitude);
                setLocationLng(position.coords.longitude);
                setIsLocating(false);
            },
            (error) => {
                setIsLocating(false);
                alert(`Unable to retrieve location: ${error.message}`);
            }
        );
    };

    return (
        <>
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
                
                {/* Location Section */}
                <div>
                    <label className="block text-sm font-medium text-gray-700">GPS Location</label>
                    <div className="mt-1 flex space-x-2">
                        <button
                            type="button"
                            onClick={handleGetLocation}
                            disabled={isLocating}
                            className="flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none"
                        >
                            {isLocating ? <SpinnerIcon className="h-4 w-4 animate-spin mr-2"/> : <MapPinIcon className="h-4 w-4 mr-2 text-red-500"/>}
                            {isLocating ? 'Locating...' : 'Capture Current Location'}
                        </button>
                    </div>
                    <div className="grid grid-cols-2 gap-4 mt-2">
                        <div>
                            <label className="block text-xs font-medium text-gray-500">Latitude</label>
                            <input 
                                type="number" 
                                step="any"
                                value={locationLat ?? ''} 
                                onChange={e => setLocationLat(e.target.value ? parseFloat(e.target.value) : undefined)}
                                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-1 px-2 text-sm bg-gray-50"
                                placeholder="0.000000"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-500">Longitude</label>
                            <input 
                                type="number" 
                                step="any"
                                value={locationLng ?? ''} 
                                onChange={e => setLocationLng(e.target.value ? parseFloat(e.target.value) : undefined)}
                                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-1 px-2 text-sm bg-gray-50"
                                placeholder="0.000000"
                            />
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Mobile Number (for Login)</label>
                        <div className="mt-1 flex">
                            <span className="inline-flex items-center px-3 rounded-l-md border border-r-0 border-gray-300 bg-gray-50 text-gray-500 text-sm">+91</span>
                            <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} className={`flex-1 min-w-0 block w-full px-3 py-2 rounded-none rounded-r-md border ${errors.phone ? 'border-red-500' : 'border-gray-300'}`} />
                        </div>
                        {errors.phone && <p className="mt-1 text-xs text-red-600">{errors.phone}</p>}
                        <p className="mt-1 text-xs text-gray-500">Default password is the mobile number + * (e.g., 9876543210*)</p>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Email</label>
                        <input type="email" value={email} onChange={e => setEmail(e.target.value)} className={`mt-1 block w-full border ${errors.email ? 'border-red-500' : 'border-gray-300'} rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm`} />
                        {errors.email && <p className="mt-1 text-xs text-red-600">{errors.email}</p>}
                    </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Milk Price (per liter)</label>
                        <input 
                            type="number"
                            step="0.01"
                            min="0"
                            value={milkPrice}
                            onChange={e => setMilkPrice(e.target.value ? parseFloat(e.target.value) : 0)}
                            required 
                            className={`mt-1 block w-full border ${errors.milkPrice ? 'border-red-500' : 'border-gray-300'} rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm`}
                        />
                        {errors.milkPrice && <p className="mt-1 text-xs text-red-600">{errors.milkPrice}</p>}
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
                </div>
                {!customerToEdit && (
                    <div className="p-4 bg-gray-50 border rounded-md">
                        <h4 className="text-sm font-medium text-gray-600 mb-2">Opening Balance (Optional)</h4>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Balance Amount</label>
                                <input 
                                    type="number"
                                    step="0.01"
                                    value={previousBalance}
                                    onChange={e => setPreviousBalance(e.target.value ? parseFloat(e.target.value) : 0)}
                                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                                />
                                <p className="mt-1 text-xs text-gray-500">Use a negative value for credit.</p>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Balance as of Date</label>
                                <input 
                                    type="date"
                                    value={balanceAsOfDate}
                                    onChange={e => setBalanceAsOfDate(e.target.value)}
                                    className={`mt-1 block w-full border ${errors.balanceAsOfDate ? 'border-red-500' : 'border-gray-300'} rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm`}
                                />
                                {errors.balanceAsOfDate && <p className="mt-1 text-xs text-red-600">{errors.balanceAsOfDate}</p>}
                            </div>
                        </div>
                    </div>
                )}
                <div>
                    <label className="block text-sm font-medium text-gray-700">Status</label>
                    <select
                        value={status}
                        onChange={e => setStatus(e.target.value as 'active' | 'inactive')}
                        required
                        className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                    >
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                    </select>
                </div>

                {customerToEdit && (
                    <div className="mt-6 pt-4 border-t">
                        <h4 className="text-sm font-medium text-gray-600 mb-2">Login Management</h4>
                        <div className="flex items-center justify-between flex-wrap gap-2">
                            <div className="text-sm text-gray-600">
                                {customerToEdit.userId ? (
                                    <span className="flex items-center text-green-600"><CheckIcon className="h-4 w-4 mr-1"/> Login Active</span>
                                ) : (
                                    <span className="text-gray-500">No active login found.</span>
                                )}
                            </div>
                            <button 
                                type="button" 
                                onClick={() => {
                                    // Pre-fill password logic if phone available
                                    if (!customerToEdit.userId && customerToEdit.phone && customerToEdit.phone.length >= 10) {
                                        // Extract last 10 digits
                                        const cleanPhone = customerToEdit.phone.replace(/\D/g, '').slice(-10);
                                        setNewPassword(cleanPhone + "*");
                                    } else {
                                        setNewPassword("");
                                    }
                                    setIsResetPasswordModalOpen(true);
                                }} 
                                className={`px-4 py-2 text-sm text-white rounded-md shadow-sm transition-colors ${customerToEdit.userId ? 'bg-yellow-500 hover:bg-yellow-600' : 'bg-green-600 hover:bg-green-700'}`}
                            >
                                {customerToEdit.userId ? 'Reset Password' : 'Create Login Credentials'}
                            </button>
                        </div>
                        {!customerToEdit.userId && (
                             <p className="text-xs text-gray-500 mt-2">
                                Creating a login will allow the customer to access their dashboard using their phone number.
                            </p>
                        )}
                    </div>
                )}

                <div className="flex justify-end pt-4 space-x-2">
                    <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300">Cancel</button>
                    <button type="submit" disabled={isSubmitting} className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-wait">
                        {isSubmitting ? 'Saving...' : (customerToEdit ? 'Update' : 'Add') + ' Customer'}
                    </button>
                </div>
            </form>
            <Modal isOpen={isResetPasswordModalOpen} onClose={() => setIsResetPasswordModalOpen(false)} title={customerToEdit?.userId ? `Reset Password for ${customerToEdit?.name}` : `Create Login for ${customerToEdit?.name}`}>
                <form onSubmit={handleResetSubmit} className="space-y-4">
                    {resetError && <p className="text-xs text-red-600">{resetError}</p>}
                    <div>
                        <label className="block text-sm font-medium text-gray-700">New Password</label>
                        <input 
                            type="text" 
                            value={newPassword} 
                            onChange={e => setNewPassword(e.target.value)} 
                            required 
                            className={`mt-1 block w-full border ${resetError ? 'border-red-500' : 'border-gray-300'} rounded-md shadow-sm py-2 px-3`}
                        />
                         <p className="mt-2 text-xs text-gray-500">The customer will need to be informed of this password manually.</p>
                    </div>
                    <div className="flex justify-end pt-4 space-x-2">
                        <button type="button" onClick={() => setIsResetPasswordModalOpen(false)} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300">Cancel</button>
                        <button type="submit" disabled={isResetting} className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 flex items-center">
                            {isResetting && <SpinnerIcon className="animate-spin h-4 w-4 mr-2" />}
                            {isResetting ? 'Processing...' : (customerToEdit?.userId ? 'Reset Password' : 'Create Login')}
                        </button>
                    </div>
                </form>
            </Modal>
        </>
    );
};

interface CustomerManagerProps {
  customers: Customer[];
  setCustomers: React.Dispatch<React.SetStateAction<Customer[]>>;
  projectRef: string | null;
  isLegacySchema: boolean;
  isReadOnly?: boolean;
  userRole: Profile['role'] | 'customer' | null;
}

const CustomerManager: React.FC<CustomerManagerProps> = ({ customers, setCustomers, projectRef, isLegacySchema, isReadOnly = false, userRole }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [customerToEdit, setCustomerToEdit] = useState<Customer | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Permission Logic
  const canDelete = userRole === 'admin' || userRole === 'super_admin';
  const canImportExport = userRole === 'admin' || userRole === 'super_admin';
  const canEdit = true; // Staff can edit, assuming they need to update phone numbers etc.

  const filteredCustomers = useMemo(() => {
    if (!searchTerm.trim()) {
      return customers;
    }
    const lowercasedFilter = searchTerm.toLowerCase();
    return customers.filter(customer =>
      customer.name.toLowerCase().includes(lowercasedFilter) ||
      customer.address.toLowerCase().includes(lowercasedFilter) ||
      customer.phone.toLowerCase().includes(lowercasedFilter) ||
      (customer.email && customer.email.toLowerCase().includes(lowercasedFilter))
    );
  }, [customers, searchTerm]);
  
  const setDefaultPasswordIfNeeded = async (customerId: string, phone: string, newUserId?: string | null) => {
    if (!phone || !/^\+91\d{10}$/.test(phone)) return;

    const tenDigitPhone = phone.slice(3);
    const password = `${tenDigitPhone}*`;

    try {
        const { data: resultingUserId, error } = await supabase.rpc('admin_set_customer_password', {
            p_customer_id: customerId,
            p_password: password
        });

        if (error) {
            throw error;
        } else if (resultingUserId && (!newUserId || newUserId !== resultingUserId)) {
             setCustomers(prev => prev.map(c => 
                c.id === customerId ? { ...c, userId: resultingUserId } : c
            ));
        }
    } catch (rpcError: any) {
        const message = getFriendlyErrorMessage(rpcError);
        console.error(`RPC call failed while setting password for customer ${customerId}:`, message);
        if (message.includes('function') && message.includes('does not exist')) {
             alert("Note: Customer created, but login creation failed. Please ask an admin to run the database setup script.");
        }
    }
  };

  const handleAddCustomer = async (customerData: Omit<Customer, 'id' | 'userId'>) => {
    setIsSubmitting(true);
    let dataToInsert: Partial<Omit<Customer, 'id' | 'userId'>> = customerData;

    if (isLegacySchema) {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { previousBalance, balanceAsOfDate, ...legacyData } = customerData;
        dataToInsert = legacyData;
    }

    try {
        const { data, error } = await supabase
            .from('customers')
            .insert(dataToInsert)
            .select()
            .single();

        if (error) throw error;
        
        if (data) {
            const newCustomer: Customer = {
                ...data,
                previousBalance: (data as any).previousBalance ?? 0,
                balanceAsOfDate: (data as any).balanceAsOfDate ?? null,
            };
            setCustomers(prev => [...prev, newCustomer].sort((a,b) => a.name.localeCompare(b.name)));
            setIsModalOpen(false);
            
            // Automatically set default password and ALERT the admin
            await setDefaultPasswordIfNeeded(newCustomer.id, newCustomer.phone);
            
            if (newCustomer.phone && newCustomer.phone.length > 10) {
                const displayPhone = newCustomer.phone.slice(3);
                alert(`Customer added successfully!\n\nA login has been created.\nUsername: ${displayPhone}\nDefault Password: ${displayPhone}*`);
            }
        }
    } catch (error: any) {
        alert(getFriendlyErrorMessage(error));
    } finally {
        setIsSubmitting(false);
    }
  };

  const handleEditCustomer = async (customerData: Omit<Customer, 'id' | 'userId'>) => {
    if (!customerToEdit) return;
    setIsSubmitting(true);
    let dataToUpdate: Partial<Omit<Customer, 'id' | 'userId'>> = customerData;
    
    if (isLegacySchema) {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { previousBalance, balanceAsOfDate, ...legacyData } = customerData;
        dataToUpdate = legacyData;
    }

    try {
      const { data, error } = await supabase
        .from('customers')
        .update(dataToUpdate)
        .eq('id', customerToEdit.id)
        .select()
        .single();
      
      if (error) throw error;

      if(data) {
        const updatedCustomer: Customer = {
            ...data,
            previousBalance: (data as any).previousBalance ?? 0,
            balanceAsOfDate: (data as any).balanceAsOfDate ?? null,
        };
        setCustomers(prev => prev.map(c => c.id === updatedCustomer.id ? updatedCustomer : c));
        
        // If phone number changed, update password
        if (customerData.phone && customerData.phone !== customerToEdit.phone) {
            await setDefaultPasswordIfNeeded(updatedCustomer.id, updatedCustomer.phone, updatedCustomer.userId);
        }
      }
      setCustomerToEdit(null);
      setIsModalOpen(false);
    } catch (error: any)
    {
        alert(getFriendlyErrorMessage(error));
    } finally {
        setIsSubmitting(false);
    }
  };

  const handleResetPassword = async (customerId: string, newPassword: string): Promise<{success: boolean}> => {
    try {
        const { data: userId, error } = await supabase.rpc('admin_set_customer_password', {
            p_customer_id: customerId,
            p_password: newPassword
        });

        if (error) throw error;
        
        // Update local state to reflect new login status immediately
        setCustomers(prev => prev.map(c => 
            c.id === customerId ? { ...c, userId: userId } : c
        ));
        
        // Also update the currently editing customer object so the modal UI updates
        if (customerToEdit && customerToEdit.id === customerId) {
             setCustomerToEdit(prev => prev ? { ...prev, userId: userId } : prev);
        }
        
        alert(`Login credentials successfully ${customerToEdit?.userId ? 'reset' : 'created'}.\n\nPassword: ${newPassword}\n\nPlease share this with the customer.`);
        return { success: true };

    } catch (error: any) {
        const msg = getFriendlyErrorMessage(error);
        alert(`Failed to process request: ${msg}`);
        return { success: false };
    }
  };


  const handleDeleteCustomer = async (id: string) => {
    if (!canDelete) return;
    if (window.confirm('Are you sure you want to delete this customer? This will also delete their login and all associated data. This action cannot be undone.')) {
        try {
            const customerToDelete = customers.find(c => c.id === id);

            // First, delete the associated auth user if one exists.
            if (customerToDelete?.userId) {
                const { error: userDeleteError } = await supabase.rpc('delete_user_by_id', {
                    target_user_id: customerToDelete.userId
                });
                
                if (userDeleteError) {
                     const msg = getFriendlyErrorMessage(userDeleteError);
                     if (!msg.includes('does not exist')) {
                        throw userDeleteError;
                     }
                }
            }

            // Proceed with deleting customer and related data
            await supabase.from('deliveries').delete().eq('customerId', id);
            await supabase.from('payments').delete().eq('customerId', id);
            await supabase.from('orders').delete().eq('customerId', id);
            const { error } = await supabase.from('customers').delete().eq('id', id);
            if (error) throw error;
            
            setCustomers(prev => prev.filter(c => c.id !== id));
        } catch (error: any) {
            alert(getFriendlyErrorMessage(error));
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
    const headers = ['name', 'address', 'phone', 'email', 'milkPrice', 'defaultQuantity', 'status', 'previousBalance', 'balanceAsOfDate', 'locationLat', 'locationLng'];
    const csvRows = [
        headers.join(','),
        ...customers.map(c => headers.map(h => {
          const key = h as keyof Customer;
          if (key === 'balanceAsOfDate' || key === 'previousBalance' || key === 'email' || key === 'locationLat' || key === 'locationLng') {
            return c[key] ?? '';
          }
          return c[key as keyof Omit<Customer, 'id' | 'userId' | 'previousBalance' | 'balanceAsOfDate' | 'email' | 'locationLat' | 'locationLng'>];
        }).join(','))
    ];
    downloadCSV(csvRows.join('\n'), 'customers.csv');
  };
  
  const handleDownloadTemplate = () => {
    const headers = 'name,address,phone,email,milkPrice,defaultQuantity,status,previousBalance,balanceAsOfDate,locationLat,locationLng';
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
        
        const newCustomersData = rows.slice(1).map(row => {
            const values = row.split(',');
            const getColumnValue = (columnName: string) => values[header.indexOf(columnName)]?.trim() || '';

            let status = getColumnValue('status').toLowerCase();
            if (status !== 'active' && status !== 'inactive') {
                status = 'active';
            }

            const phoneRaw = getColumnValue('phone').replace(/\D/g, '');
            const phoneFormatted = phoneRaw ? `+91${phoneRaw.slice(-10)}` : '';

            const lat = parseFloat(getColumnValue('locationLat'));
            const lng = parseFloat(getColumnValue('locationLng'));

            return {
                name: getColumnValue('name'),
                address: getColumnValue('address'),
                phone: phoneFormatted,
                email: getColumnValue('email'),
                milkPrice: parseFloat(getColumnValue('milkPrice')) || 0,
                defaultQuantity: parseFloat(getColumnValue('defaultQuantity')) || 0,
                status: status as 'active' | 'inactive',
                previousBalance: parseFloat(getColumnValue('previousBalance')) || 0,
                balanceAsOfDate: getColumnValue('balanceAsOfDate') || null,
                locationLat: isNaN(lat) ? undefined : lat,
                locationLng: isNaN(lng) ? undefined : lng,
            };
        }).filter(customer => customer.name);

        if (newCustomersData.length === 0) {
            alert("No valid customer data found to import.");
            return;
        }

        const { data, error } = await supabase.from('customers').insert(newCustomersData).select();
        if (error) throw error;

        if (data) {
            const importedCustomers = data as Customer[];
            setCustomers(prev => [...prev, ...importedCustomers].sort((a,b) => a.name.localeCompare(b.name)));
            
            // Set passwords for imported customers in the background
            for (const customer of importedCustomers) {
                await setDefaultPasswordIfNeeded(customer.id, customer.phone);
            }
            alert(`${importedCustomers.length} customers imported successfully.`);
        }
  }

  const handleFileImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const text = e.target?.result;
            if (typeof text !== 'string') {
              alert('Error reading file content.');
              return;
            }
            await processAndImportCustomers(text);
        } catch (error: any) {
            alert("An error occurred while importing: " + getFriendlyErrorMessage(error));
        } finally {
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
        }
    };
    reader.readAsText(file);
  };

  const handleDeleteAllCustomers = async () => {
    if (!canDelete) return;
    
    const confirmation = prompt(
      "DANGER: This will permanently delete ALL customers. Type 'DELETE ALL CUSTOMERS' to confirm."
    );

    if (confirmation !== 'DELETE ALL CUSTOMERS') {
      alert('Action cancelled.');
      return;
    }
    
    setIsSubmitting(true);
    try {
        const { error } = await supabase.rpc('admin_delete_all_customers');
        if (error) throw error;
        
        alert('All customer data has been successfully deleted.');
        window.location.reload();
        
    } catch (error: any) {
        alert(getFriendlyErrorMessage(error));
    } finally {
        setIsSubmitting(false);
    }
  };

  return (
    <div>
        <div className="flex justify-between items-center mb-6 flex-wrap gap-4">
            <h2 className="text-3xl font-bold text-gray-800">Customers</h2>
            <div className="flex items-center gap-2 flex-wrap">
                <div className="relative">
                    <input
                        type="text"
                        placeholder="Search name, address, phone..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="border border-gray-300 rounded-lg shadow-sm py-2 px-3 pl-10 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                    />
                    <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                </div>
                {!isReadOnly && (
                    <>
                        {canImportExport && (
                            <>
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
                            </>
                        )}
                        <button onClick={openAddModal} className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg shadow-sm hover:bg-blue-700 transition-colors">
                            <PlusIcon className="h-5 w-5 mr-2"/>
                            Add Customer
                        </button>
                    </>
                )}
            </div>
        </div>

        <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={customerToEdit ? 'Edit Customer' : 'Add New Customer'}>
            <CustomerForm
                onSubmit={customerToEdit ? handleEditCustomer : handleAddCustomer}
                onClose={() => setIsModalOpen(false)}
                customerToEdit={customerToEdit}
                isSubmitting={isSubmitting}
                onResetPassword={async (newPassword) => {
                    if (customerToEdit) {
                        return await handleResetPassword(customerToEdit.id, newPassword);
                    }
                    return { success: false };
                }}
            />
        </Modal>
        
        <div className="bg-white shadow-md rounded-lg overflow-hidden">
             {customers.length > 0 ? (
                filteredCustomers.length > 0 ? (
                    <div>
                        {/* Desktop Table View */}
                        <div className="overflow-x-auto hidden lg:block">
                            <table className="w-full text-sm text-left text-gray-500">
                                <thead className="text-xs text-gray-700 uppercase bg-gray-50">
                                    <tr>
                                        <th scope="col" className="px-6 py-3">Name</th>
                                        <th scope="col" className="px-6 py-3">Address</th>
                                        <th scope="col" className="px-6 py-3">Login Phone</th>
                                        <th scope="col" className="px-6 py-3">Status</th>
                                        {!isReadOnly && <th scope="col" className="px-6 py-3 text-right">Actions</th>}
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredCustomers.map(customer => (
                                        <tr key={customer.id} className="bg-white border-b hover:bg-gray-50">
                                            <th scope="row" className="px-6 py-4 font-medium text-gray-900 whitespace-nowrap">{customer.name}</th>
                                            <td className="px-6 py-4 flex items-center">
                                                {customer.address}
                                                {customer.locationLat && customer.locationLng && (
                                                    <a 
                                                        href={`https://www.google.com/maps/search/?api=1&query=${customer.locationLat},${customer.locationLng}`} 
                                                        target="_blank" 
                                                        rel="noopener noreferrer"
                                                        className="ml-2 text-blue-500 hover:text-blue-700"
                                                        title="Open in Google Maps"
                                                    >
                                                        <MapPinIcon className="h-5 w-5" />
                                                    </a>
                                                )}
                                            </td>
                                            <td className="px-6 py-4">{customer.phone || 'N/A'}</td>
                                            <td className="px-6 py-4">
                                                <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full capitalize ${
                                                    customer.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                                                }`}>
                                                    {customer.status}
                                                </span>
                                                {customer.userId && (
                                                    <span className="ml-2 px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-100 text-blue-800 items-center"><CheckIcon className="h-3 w-3 mr-1" /> Login Active</span>
                                                )}
                                            </td>
                                            {!isReadOnly && (
                                                <td className="px-6 py-4 text-right space-x-4">
                                                    {canEdit && <button onClick={() => openEditModal(customer)} className="text-blue-600 hover:text-blue-800 inline-block align-middle" title="Edit Customer"><EditIcon className="w-5 h-5"/></button>}
                                                    {canDelete && <button onClick={() => handleDeleteCustomer(customer.id)} className="text-red-600 hover:text-red-800 inline-block align-middle" title="Delete Customer"><TrashIcon className="w-5 h-5"/></button>}
                                                </td>
                                            )}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* Mobile & Tablet Card View */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 lg:hidden">
                            {filteredCustomers.map(customer => (
                                <div key={customer.id} className="bg-white border rounded-lg shadow-sm p-4 flex flex-col justify-between">
                                    <div>
                                        <div className="flex justify-between items-start mb-2">
                                            <h3 className="font-bold text-lg text-gray-800">{customer.name}</h3>
                                            <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full capitalize ${
                                                customer.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                                            }`}>
                                                {customer.status}
                                            </span>
                                        </div>
                                        <div className="text-sm text-gray-600 space-y-1">
                                            <div className="flex items-center">
                                                <p><strong className="font-medium">Address:</strong> {customer.address}</p>
                                                {customer.locationLat && customer.locationLng && (
                                                    <a 
                                                        href={`https://www.google.com/maps/search/?api=1&query=${customer.locationLat},${customer.locationLng}`} 
                                                        target="_blank" 
                                                        rel="noopener noreferrer"
                                                        className="ml-2 text-blue-500 hover:text-blue-700"
                                                        title="Open in Google Maps"
                                                    >
                                                        <MapPinIcon className="h-5 w-5" />
                                                    </a>
                                                )}
                                            </div>
                                            <p><strong className="font-medium">Phone:</strong> {customer.phone || 'N/A'}</p>
                                            {customer.userId && (
                                                <p className="font-semibold text-green-600 flex items-center"><CheckIcon className="h-4 w-4 mr-1"/> Login Active</p>
                                            )}
                                        </div>
                                    </div>
                                    {!isReadOnly && (
                                        <div className="flex justify-end gap-2 mt-4 pt-2 border-t">
                                            {canEdit && <button onClick={() => openEditModal(customer)} className="flex items-center px-3 py-1.5 text-sm bg-blue-500 text-white rounded-md hover:bg-blue-600"><EditIcon className="w-4 h-4 mr-1"/> Edit</button>}
                                            {canDelete && <button onClick={() => handleDeleteCustomer(customer.id)} className="flex items-center px-3 py-1.5 text-sm bg-red-500 text-white rounded-md hover:bg-red-600"><TrashIcon className="w-4 h-4 mr-1"/> Delete</button>}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                ) : (
                    <div className="text-center py-12 px-6">
                        <h3 className="text-lg font-medium text-gray-700">No Customers Match Your Search</h3>
                        <p className="mt-1 text-sm text-gray-500">Try a different name, address, or phone number.</p>
                    </div>
                )
            ) : (
                <div className="text-center py-12 px-6">
                    <h3 className="text-lg font-medium text-gray-700">No Customers Found</h3>
                    <p className="mt-1 text-sm text-gray-500">Get started by adding a new customer.</p>
                    {!isReadOnly && (
                        <div className="mt-4">
                            <button onClick={openAddModal} className="flex items-center mx-auto px-4 py-2 bg-blue-600 text-white rounded-lg shadow-sm hover:bg-blue-700 transition-colors">
                                <PlusIcon className="h-5 w-5 mr-2"/>
                                Add Customer
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
        
        {canDelete && customers.length > 0 && (
            <div className="mt-8 p-4 bg-red-50 border-t-4 border-red-500 rounded-b-lg shadow-md">
                <h3 className="text-lg font-bold text-red-800">Danger Zone</h3>
                <p className="mt-1 text-sm text-red-700">
                    This action is irreversible and will permanently delete all customer data.
                </p>
                <div className="mt-4">
                    <button
                        onClick={handleDeleteAllCustomers}
                        disabled={isSubmitting}
                        className="flex items-center px-4 py-2 bg-red-600 text-white rounded-lg shadow-sm hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-wait"
                    >
                        {isSubmitting ? (
                            <>
                                <SpinnerIcon className="animate-spin h-5 w-5 mr-2" />
                                Deleting...
                            </>
                        ) : (
                            <>
                                <TrashIcon className="h-5 w-5 mr-2" />
                                Delete All Customers
                            </>
                        )}
                    </button>
                </div>
            </div>
        )}
    </div>
  );
};

export default CustomerManager;