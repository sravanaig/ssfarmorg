
import React, { useState, useEffect, useRef } from 'react';
import type { Customer } from '../types';
import Modal from './Modal';
import { PlusIcon, EditIcon, TrashIcon, UploadIcon, DownloadIcon } from './Icons';
import { supabase } from '../lib/supabaseClient';

interface CustomerManagerProps {
  customers: Customer[];
  setCustomers: React.Dispatch<React.SetStateAction<Customer[]>>;
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
    const [milkPrice, setMilkPrice] = useState(0);
    const [defaultQuantity, setDefaultQuantity] = useState(1);

    useEffect(() => {
        if (customerToEdit) {
            setName(customerToEdit.name);
            setAddress(customerToEdit.address);
            setPhone(customerToEdit.phone);
            setMilkPrice(customerToEdit.milkPrice);
            setDefaultQuantity(customerToEdit.defaultQuantity);
        } else {
            setName('');
            setAddress('');
            setPhone('');
            setMilkPrice(0);
            setDefaultQuantity(1);
        }
    }, [customerToEdit]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSubmit({ name, address, phone, milkPrice, defaultQuantity });
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <div>
                <label className="block text-sm font-medium text-gray-700">Name</label>
                <input type="text" value={name} onChange={e => setName(e.target.value)} required className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm" />
            </div>
            <div>
                <label className="block text-sm font-medium text-gray-700">Address</label>
                <input type="text" value={address} onChange={e => setAddress(e.target.value)} required className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm" />
            </div>
            <div>
                <label className="block text-sm font-medium text-gray-700">Phone</label>
                <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm" />
            </div>
            <div>
                <label className="block text-sm font-medium text-gray-700">Milk Price (per liter/unit)</label>
                <input type="number" step="0.01" value={milkPrice} onChange={e => setMilkPrice(parseFloat(e.target.value))} required className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm" />
            </div>
            <div>
                <label className="block text-sm font-medium text-gray-700">Default Quantity (liters/units)</label>
                <input type="number" step="0.5" value={defaultQuantity} onChange={e => setDefaultQuantity(parseFloat(e.target.value))} required className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm" />
            </div>
            <div className="flex justify-end pt-4 space-x-2">
                <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700">{customerToEdit ? 'Update' : 'Add'} Customer</button>
            </div>
        </form>
    );
};

const CustomerManager: React.FC<CustomerManagerProps> = ({ customers, setCustomers }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [customerToEdit, setCustomerToEdit] = useState<Customer | null>(null);
  const [isSeeding, setIsSeeding] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleAddCustomer = async (customerData: Omit<Customer, 'id' | 'userId'>) => {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("You must be logged in to add a customer.");

        const { data, error } = await supabase
            .from('customers')
            .insert([{ ...customerData, userId: user.id }])
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
            return {
                name: values[header.indexOf('name')].trim(),
                address: values[header.indexOf('address')].trim(),
                phone: values[header.indexOf('phone')].trim().replace('?',''),
                milkPrice: parseFloat(values[header.indexOf('milkPrice')]) || 0,
                defaultQuantity: parseFloat(values[header.indexOf('defaultQuantity')]) || 0,
                userId: user.id,
            };
        });

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

  const handleSeedData = async () => {
    setIsSeeding(true);
    const csvData = `name,address,phone,milkPrice,defaultQuantity
ABHINAV REDDY,Medipally,8978173143,90,1
Akhil Ramidi,Medipally,8297592481,90,0.5
Aravind,Medipally,9885134431,90,1
Arram Satyanarayana,Medipally,9391126999,90,0.5
B Tech Rakesh,Medipally,9398007582,90,0.5
Bhagyalakshmi,Medipally,9704400116,90,0.5
Bhaskar,Medipally,7093477304,90,1
Bullabbai,Medipally,8466042015,90,0.5
Chinnam Raju,Medipally,9000605257,90,0.5
Dayakar Reddy Sai Ishwarya,Medipally,9550639548,90,0.5
Devender M,Medipally,9394841050,90,1
DLN,Medipally,9866602647,90,0.5
Dr Naresh,Medipally,9700241550,90,0.5
Dr. Vivek,Medipally,9908584400,90,0.5
GANESH,Medipally,9177477320,90,0.5
Idli bandi,Medipally,8019635177,90,0.5
KAPIL,Medipally,8790967957,90,0.5
Kiran Akhil,Medipally,9390472205,90,0.5
M Bhanu Pratap,Medipally,9063842335,90,0.5
MAhesh Flexy,Medipally,8919461017,90,1
Mallareddy Sai Ishwarya,Medipally,9000877034,90,0.5
Mendu,Medipally,7306308573,90,0.5
Moole Madhusoodhan,Medipally,9959187960,90,0.5
Musli Sunil,Medipally,6305251123,90,1
NANI,Medipally,9000222309,90,0.5
Naresh Kolagani,Medipally,9948464446,90,0.5
Naveen Decors,Medipally,9700241550,90,0.5
Ambika OM Viharika,Medipally,7013125811,90,1
Sudhakar Nayak VN Colony,Medipally,9490042454,90,0.5
Nayak- Seshagiri,Medipally,9701919574,90,0.5
Padma VN Colony,Medipally,9948464446,90,0.5
PASHA,Medipally,9290209672,90,0.5
Penta Sravan,Medipally,9347018900,90,0.5
PRASAD RMP,Medipally,7013125811,90,0.5
Rakhi Raghavender,Medipally,9494268454,90,0.5
Ramesh Yele,Medipally,9703230002,90,0.5
RAVI KUMAR,Medipally,8008108431,90,0.5
Sai Kiran BAJAJ,Medipally,9000767821,90,0.5
SARASWATI,Medipally,7386463787,90,0.5
Sheela Ravinder,Medipally,8919027576,90,0.5
Sheshagiri Rao,Medipally,9290014132,90,1
Shyam jee,Medipally,9866663504,90,0.5
Singham Lakshman,Medipally,9000767904,90,1
SRAVAN REDDY,Medipally,9666066722,90,0.5
Srikanth Sankuri,Medipally,9701096269,90,0.5
Srinivas apex,Medipally,9666629639,90,1
Srinivas Madhugani,Medipally,9949223107,90,0.5
SRINIVAS YOGA,Medipally,9490379036,90,0.5
Srisailam Balda,Medipally,9290003464,90,0.5
SUBHASHINI,Medipally,9133763118,90,0.5
Sudhakar,Medipally,9959202010,90,0.5
Suman Gajula,Medipally,8686110022,90,0.5
Sunkari Surender,Medipally,8686860404,90,0.5
SURESH Kolagani,Medipally,8297297272,90,0.5
U Sravani chaitanya,Medipally,9247009999,90,2
Vakiti Harikrishan,Medipally,9848356916,90,1
Vamshi Gillella,Medipally,9885690291,90,0.5
Venkanna Chick Shop,Medipally,8978956142,90,0.5
Vikram,Medipally,9491609023,90,0.5
YASOJU KS,Medipally,9347203760,90,1
Yadagiri Podile Panchavati 2,Medipally,9347519577?,90,0.5
Rangaiah MNR,Medipally,9542708465,90,0.5
Vijay Kumar Aniganti,Medipally,9866224788,90,0.5
Sandeep - Medipally,Medipally,9966989626,90,1
Bussa Radhika,Medipally,9848583893,90,0.5
Lorry Service,Medipally,9052311502,90,1
VIJAYA USHA RANI RCUES,Medipally,8639817210,90,0.5
ANITHA RCUES,Medipally,7799448356,90,0.5
Nagaraju Akhil,Medipally,,90,0.5
Shashi Narugula Suma residency,Medipally,9042367693,90,0.5
Veeresh Akhil,Medipally,,90,0.5
Akhil Ref V Puri 22,Medipally,,90,0.5
Ramesh chary Puppala,Medipally,9393303337,90,0.5
Goutham Reddy,Medipally,9182810459,90,0.5
Raj Kumar Sunil setu,Medipally,7995900498,90,0.5
Prakash Harihara,Medipally,9700908872,90,0.5
Kanjula Suguna Reddy,Medipally,,90,0.5
Ambala Sravan,Medipally,9490555664,90,0.5
Siddanth Javadeagam,Medipally,9966497214,90,0.5
Tekula Mahinder Reddy,Medipally,9966651276,90,1
Yadagiri Tenent,Medipally,,90,0.5
Ravinder Buttumgari,Medipally,8106484037,90,0.5
Shyam Rapaka,Medipally,7893267452,90,0.5
Dayakar REddy p&T,Medipally,,90,0.5
Venkanna G Panchavati,Medipally,,90,0.5
RK Bro 203 VSR,Medipally,,90,0.5
PVC SHEKAR,Medipally,,90,1`;
     try {
        await processAndImportCustomers(csvData);
    } catch (error: any) {
        alert("An error occurred while importing the sample data: " + error.message);
        console.error(error);
    } finally {
        setIsSeeding(false);
    }
  }


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
                        <p className="mt-1 text-sm text-gray-500">Get started by adding a customer or importing the provided sample data.</p>
                        <div className="mt-4 flex justify-center items-center gap-4">
                            <button onClick={openAddModal} className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg shadow-sm hover:bg-blue-700 transition-colors">
                                <PlusIcon className="h-5 w-5 mr-2"/>
                                Add Customer
                            </button>
                             <button onClick={handleSeedData} disabled={isSeeding} className="flex items-center px-4 py-2 bg-green-600 text-white rounded-lg shadow-sm hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-wait">
                                {isSeeding ? 'Importing...' : 'Seed Sample Customers'}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    </div>
  );
};

export default CustomerManager;
