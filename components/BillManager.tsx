import React, { useState, useMemo, useEffect, useRef } from 'react';
import type { Customer, Delivery, Payment } from '../types';
import { ShareIcon, PrintIcon, WhatsAppIcon, DownloadIcon, SearchIcon, ScanIcon, UploadIcon } from './Icons';
import { supabase } from '../lib/supabaseClient';
import { getFriendlyErrorMessage } from '../lib/errorHandler';
import QuantityInput from './QuantityInput';

interface BillManagerProps {
  customers: Customer[];
  deliveries: Delivery[];
  setDeliveries: React.Dispatch<React.SetStateAction<Delivery[]>>;
  payments: Payment[];
  isReadOnly?: boolean;
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

interface BillDetails {
    customer: Customer;
    period: string;
    deliveriesForPeriod: Delivery[];
    totalQuantity: number;
    totalAmount: number;
    totalPaid: number;
    balance: number;
    previousBalance: number;
}

interface CustomerBillStatus {
    customer: Customer;
    billForMonth: number;
    paidForMonth: number;
    pendingForMonth: number;
    status: 'Paid' | 'Partially Paid' | 'Pending' | 'No Bill' | 'Overpaid';
}

const BillManager: React.FC<BillManagerProps> = ({ customers, deliveries, setDeliveries, payments, isReadOnly = false }) => {
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | ''>('');
  const [billingMonth, setBillingMonth] = useState<string>(`${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`);
  const [searchTerm, setSearchTerm] = useState('');
  const [editedQuantities, setEditedQuantities] = useState<Map<string, string>>(new Map());
  const [isSaving, setIsSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string | null>(null);
  const [isQrLoading, setIsQrLoading] = useState(false);
  const [viewMode, setViewMode] = useState<'generate' | 'status'>('generate');

  const activeCustomers = useMemo(() => customers.filter(c => c.status === 'active'), [customers]);

  const allBillDetails = useMemo((): BillDetails[] => {
    if (!billingMonth) return [];

    const [year, month] = billingMonth.split('-').map(Number);
    const startDate = new Date(Date.UTC(year, month - 1, 1));
    const endDate = new Date(Date.UTC(year, month, 0));

    const detailsForAllCustomers = customers.map(customer => {
        // Previous Balance Calculation (NEW LOGIC)
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
            // Fallback to original full historical calculation
            const historicalDeliveries = deliveries.filter(d => {
                const deliveryDate = new Date(d.date + 'T00:00:00Z');
                return d.customerId === customer.id && deliveryDate < startDate;
            });
            const historicalPayments = payments.filter(p => {
                const paymentDate = new Date(p.date + 'T00:00:00Z');
                return p.customerId === customer.id && paymentDate < startDate;
            });

            const totalHistoricalDue = historicalDeliveries.reduce((sum, d) => sum + (d.quantity * customer.milkPrice), 0);
            const totalHistoricalPaid = historicalPayments.reduce((sum, p) => sum + p.amount, 0);
            previousBalance = totalHistoricalDue - totalHistoricalPaid;
        }

        // Current Month Calculations
        const deliveriesForPeriod = deliveries.filter(d => {
            const deliveryDate = new Date(d.date + 'T00:00:00Z');
            return d.customerId === customer.id && deliveryDate >= startDate && deliveryDate <= endDate;
        }).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        const paymentsForPeriod = payments.filter(p => {
            const paymentDate = new Date(p.date + 'T00:00:00Z');
            return p.customerId === customer.id && paymentDate >= startDate && paymentDate <= endDate;
        });

        const totalQuantity = deliveriesForPeriod.reduce((sum, d) => sum + d.quantity, 0);
        const totalAmount = totalQuantity * customer.milkPrice;
        const totalPaid = paymentsForPeriod.reduce((sum, p) => sum + p.amount, 0);
        const balance = previousBalance + totalAmount - totalPaid;

        return {
            customer,
            period: `${startDate.toLocaleDateString('en-CA', { timeZone: 'UTC' })} - ${endDate.toLocaleDateString('en-CA', { timeZone: 'UTC' })}`,
            deliveriesForPeriod,
            totalQuantity,
            totalAmount,
            totalPaid,
            balance,
            previousBalance
        };
    });
    
    const lowercasedFilter = searchTerm.toLowerCase().trim();

    return detailsForAllCustomers.filter(details => {
        const hasActivity = details.deliveriesForPeriod.length > 0 || details.totalPaid > 0;
        // Show if active, or if inactive but with a non-zero balance or activity in the current period.
        const isVisible = details.customer.status === 'active' || details.balance !== 0 || hasActivity;
        
        if (!isVisible) return false;

        if (!lowercasedFilter) {
            return true;
        }

        return details.customer.name.toLowerCase().includes(lowercasedFilter);
    });

  }, [billingMonth, customers, deliveries, payments, searchTerm]);

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

  useEffect(() => {
    // If the selected customer is filtered out, deselect them and clear pending changes
    if (selectedCustomerId && !allBillDetails.some(d => d.customer.id === selectedCustomerId)) {
      setSelectedCustomerId('');
    }
  }, [allBillDetails, selectedCustomerId]);

  useEffect(() => {
    // Clear any pending edits when the customer or month changes
    setEditedQuantities(new Map());
  }, [selectedCustomerId, billingMonth]);


  const selectedCustomerBillDetails = useMemo(() => {
    if (!selectedCustomerId) return null;
    return allBillDetails.find(d => d.customer.id === selectedCustomerId) || null;
  }, [selectedCustomerId, allBillDetails]);
  
  useEffect(() => {
    if (selectedCustomerBillDetails?.balance && selectedCustomerBillDetails.balance > 0) {
        const generateAndFetchQr = async () => {
            setIsQrLoading(true);
            setQrCodeDataUrl(null);
            try {
                const { balance } = selectedCustomerBillDetails;
                const [year, month] = billingMonth.split('-');
                const billingPeriodForNote = new Date(parseInt(year), parseInt(month) - 1, 1).toLocaleString('default', { month: 'short', year: 'numeric' });
                const upiLink = `upi://pay?pa=9959202010@upi&pn=ssfarmorganic&am=${balance.toFixed(2)}&tn=Bill for ${billingPeriodForNote}`;
                const qrCodeApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(upiLink)}`;

                const response = await fetch(qrCodeApiUrl);
                if (!response.ok) throw new Error('Failed to fetch QR code');
                const blob = await response.blob();
                
                const reader = new FileReader();
                reader.onloadend = () => {
                    setQrCodeDataUrl(reader.result as string);
                    setIsQrLoading(false);
                };
                reader.readAsDataURL(blob);

            } catch (error) {
                console.error("Failed to generate QR code:", error);
                setIsQrLoading(false);
            }
        };
        generateAndFetchQr();
    } else {
        setQrCodeDataUrl(null);
    }
  }, [selectedCustomerBillDetails, billingMonth]);

  const handlePrint = () => {
    window.print();
  };
  
  const generateBillMessage = (details: BillDetails | null) => {
    if (!details) return '';

    const { customer, totalQuantity, totalAmount, totalPaid, balance, previousBalance } = details;
    
    const [year, month] = billingMonth.split('-');
    const billingPeriod = new Date(parseInt(year), parseInt(month) - 1, 1).toLocaleString('default', { month: 'long', year: 'numeric' });
    
    const upiId = '9959202010@upi';
    const upiLink = `upi://pay?pa=${upiId}&pn=ssfarmorganic&am=${balance.toFixed(2)}&tn=Bill for ${billingPeriod}`;

    return `*ssfarmorganic - Milk Bill*
-----------------------------------
*Customer:* ${customer.name}
*Billing Period:* ${billingPeriod}
-----------------------------------
Previous Balance: ₹${previousBalance.toFixed(2)}
This Month's Bill:
  - Total Quantity: *${totalQuantity.toFixed(2)} L*
  - Amount: ₹${totalAmount.toFixed(2)}

*Total Amount Due:* ₹${(previousBalance + totalAmount).toFixed(2)}
Payments this month: - ₹${totalPaid.toFixed(2)}
-----------------------------------
*Outstanding Balance: ₹${balance.toFixed(2)}*

To pay, please use this UPI ID:
\`${upiId}\`

Or click this link to pay directly:
${balance > 0 ? upiLink : '(No payment needed)'}

Thank you for choosing ssfarmorganic!
`.trim().replace(/^\s+/gm, '');
  };

  const handleShareWhatsApp = (details: BillDetails) => {
    const message = generateBillMessage(details);
    if(details.customer.phone){
      const whatsappUrl = `https://wa.me/${details.customer.phone}?text=${encodeURIComponent(message)}`;
      window.open(whatsappUrl, '_blank');
    } else {
      alert("This customer does not have a phone number saved.");
    }
  };

  const handleEditQuantity = (deliveryId: number, newQuantity: string) => {
    setEditedQuantities(prev => new Map(prev).set(String(deliveryId), newQuantity));
  };

  const handleSaveChanges = async () => {
    if (editedQuantities.size === 0) return;
    setIsSaving(true);
    try {
        const updates = Array.from(editedQuantities.entries()).map(([id, quantity]) => ({
            id: Number(id),
            quantity: quantity === '' ? 0 : parseFloat(quantity),
        }));

        const deliveriesToUpdate = updates.filter(u => u.quantity > 0);
        const deliveriesToDelete = updates.filter(u => u.quantity === 0);

        if (deliveriesToUpdate.length > 0) {
            const { error } = await supabase.from('deliveries').upsert(deliveriesToUpdate);
            if (error) throw error;
        }
        
        if (deliveriesToDelete.length > 0) {
            const { error } = await supabase.from('deliveries').delete().in('id', deliveriesToDelete.map(d => d.id));
            if (error) throw error;
        }

        setDeliveries(prev => {
            const afterDeletes = prev.filter(d => !deliveriesToDelete.some(del => del.id === d.id));
            const updatedMap = new Map(afterDeletes.map(d => [d.id, d]));
            deliveriesToUpdate.forEach(u => {
                const existing = updatedMap.get(u.id);
                if (existing) {
                    updatedMap.set(u.id, { ...existing, quantity: u.quantity });
                }
            });
            return Array.from(updatedMap.values());
        });

        setEditedQuantities(new Map());
        alert("Changes saved successfully!");
    } catch (error: any) {
        alert("Error saving changes: " + getFriendlyErrorMessage(error));
    } finally {
        setIsSaving(false);
    }
  };
  
  const handleExport = () => {
    const headers = [ 'customerName', 'billingMonth', 'previousBalance', 'monthlyBill', 'totalDue', 'paidThisMonth', 'outstandingBalance' ];
    const csvRows = [
        headers.join(','),
        ...allBillDetails.map(d => [
            d.customer.name.replace(/,/g, ''),
            billingMonth,
            d.previousBalance.toFixed(2),
            d.totalAmount.toFixed(2),
            (d.previousBalance + d.totalAmount).toFixed(2),
            d.totalPaid.toFixed(2),
            d.balance.toFixed(2),
        ].join(','))
    ];
    downloadCSV(csvRows.join('\n'), `bills_${billingMonth}.csv`);
  };

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
            <div className="flex flex-col md:flex-row justify-between md:items-center mb-6 gap-4">
                <h2 className="text-3xl font-bold text-gray-800">Bills</h2>
                <div className="flex items-center flex-wrap gap-4">
                    <div className="relative">
                        <input type="text" placeholder="Search customer..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full sm:w-64 border border-gray-300 rounded-md shadow-sm py-2 px-3 pl-10 focus:outline-none focus:ring-blue-500 focus:border-blue-500" />
                        <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                    </div>
                    <input type="month" value={billingMonth} onChange={e => setBillingMonth(e.target.value)} className="w-full sm:w-auto border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500" />
                     {!isReadOnly && <button onClick={handleExport} className="flex items-center px-3 py-2 text-sm bg-gray-600 text-white rounded-lg shadow-sm hover:bg-gray-700"><DownloadIcon className="h-4 w-4 mr-2"/> Export Bills</button>}
                </div>
            </div>

            <div className="mb-6">
                <div className="border-b border-gray-200">
                    <nav className="-mb-px flex space-x-8" aria-label="Tabs">
                        <button onClick={() => setViewMode('generate')} className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${viewMode === 'generate' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}>
                            Generate & Edit Bills
                        </button>
                        <button onClick={() => setViewMode('status')} className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${viewMode === 'status' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}>
                            Payment Status
                        </button>
                    </nav>
                </div>
            </div>

            {viewMode === 'generate' && (
                 <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="lg:col-span-1 bg-white p-4 rounded-lg shadow-md">
                        <h3 className="font-semibold text-lg mb-2">Customers</h3>
                        <p className="text-sm text-gray-500 mb-4">Select a customer to view or edit their bill.</p>
                        <ul className="space-y-2 max-h-[65vh] overflow-y-auto">
                            {allBillDetails.sort((a,b) => a.customer.name.localeCompare(b.customer.name)).map(details => (
                                <li key={details.customer.id}>
                                    <button onClick={() => setSelectedCustomerId(details.customer.id)} className={`w-full text-left p-3 rounded-md transition-colors ${selectedCustomerId === details.customer.id ? 'bg-blue-600 text-white shadow' : 'bg-gray-50 hover:bg-gray-100'}`}>
                                        <div className="flex justify-between items-center">
                                            <span className="font-medium">{details.customer.name}</span>
                                            <span className={`text-sm font-bold ${details.balance > 0 ? 'text-red-500' : (selectedCustomerId === details.customer.id ? 'text-blue-200' : 'text-green-600')} ${selectedCustomerId === details.customer.id && 'text-white'}`}>
                                                ₹{details.balance.toFixed(2)}
                                            </span>
                                        </div>
                                        <p className={`text-xs ${selectedCustomerId === details.customer.id ? 'text-blue-200' : 'text-gray-500'}`}>{details.customer.address}</p>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </div>

                    <div className="lg:col-span-2 bg-white p-6 rounded-lg shadow-md print-area">
                        {selectedCustomerBillDetails ? (
                            <div>
                                <div className="flex justify-between items-start mb-4 no-print">
                                    <div>
                                        <h3 className="text-2xl font-bold text-gray-800">{selectedCustomerBillDetails.customer.name}</h3>
                                        <p className="text-gray-600">{selectedCustomerBillDetails.customer.address}</p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button onClick={() => handleShareWhatsApp(selectedCustomerBillDetails)} className="p-2 text-green-600 bg-green-100 rounded-full hover:bg-green-200"><WhatsAppIcon className="h-6 w-6"/></button>
                                        <button onClick={handlePrint} className="p-2 text-gray-600 bg-gray-100 rounded-full hover:bg-gray-200"><PrintIcon className="h-6 w-6"/></button>
                                    </div>
                                </div>
                                <div className="space-y-2 text-gray-700 mb-4">
                                     <p className="flex justify-between"><span>Previous Balance:</span> <strong>₹{selectedCustomerBillDetails.previousBalance.toFixed(2)}</strong></p>
                                     <p className="flex justify-between"><span>This Month's Bill:</span> <strong>₹{selectedCustomerBillDetails.totalAmount.toFixed(2)}</strong></p>
                                     <p className="flex justify-between border-t pt-2 mt-2"><span>Total Amount Due:</span> <strong>₹{(selectedCustomerBillDetails.previousBalance + selectedCustomerBillDetails.totalAmount).toFixed(2)}</strong></p>
                                     <p className="flex justify-between"><span>Payments this month:</span> <strong className="text-green-600">- ₹{selectedCustomerBillDetails.totalPaid.toFixed(2)}</strong></p>
                                     <p className={`flex justify-between text-xl font-bold border-t pt-2 mt-2 ${selectedCustomerBillDetails.balance > 0 ? 'text-red-600' : 'text-green-600'}`}>
                                        <span>Outstanding Balance:</span> 
                                        <span>₹{selectedCustomerBillDetails.balance.toFixed(2)}</span>
                                    </p>
                                </div>
                                {qrCodeDataUrl && (
                                    <div className="text-center my-4 py-4 border-t border-b">
                                        <h4 className="text-sm font-semibold text-gray-600 mb-2">Scan to Pay</h4>
                                        <img src={qrCodeDataUrl} alt="UPI QR Code" className="mx-auto rounded-lg"/>
                                    </div>
                                )}
                                <h4 className="font-semibold text-lg mt-6 mb-2">Deliveries this month ({selectedCustomerBillDetails.deliveriesForPeriod.length})</h4>
                                <div className="overflow-y-auto max-h-60 border rounded-lg">
                                    <table className="w-full text-sm">
                                        <thead className="bg-gray-50 sticky top-0"><tr><th className="px-4 py-2 text-left font-medium text-gray-600">Date</th><th className="px-4 py-2 text-right font-medium text-gray-600">Quantity (L)</th></tr></thead>
                                        <tbody>
                                            {selectedCustomerBillDetails.deliveriesForPeriod.map(d => (
                                                <tr key={d.id} className="border-t">
                                                    <td className="px-4 py-2">{new Date(d.date + 'T00:00:00Z').toLocaleDateString('en-GB', { timeZone: 'UTC', day: '2-digit', month: 'short' })}</td>
                                                    <td className="px-4 py-2 text-right">
                                                        <QuantityInput
                                                            value={editedQuantities.get(String(d.id)) ?? d.quantity}
                                                            onChange={(newValue) => handleEditQuantity(d.id, newValue)}
                                                            readOnly={isReadOnly}
                                                        />
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                {!isReadOnly && editedQuantities.size > 0 && (
                                     <div className="mt-4 text-right">
                                        <button onClick={handleSaveChanges} disabled={isSaving} className="px-6 py-2 bg-blue-600 text-white rounded-lg shadow-sm hover:bg-blue-700 transition-colors disabled:opacity-50">
                                            {isSaving ? 'Saving...' : `Save ${editedQuantities.size} Changes`}
                                        </button>
                                    </div>
                                )}
                            </div>
                        ) : (
                             <div className="text-center py-20 text-gray-500">
                                <p>Select a customer from the list to view their bill details.</p>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {viewMode === 'status' && (
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
            )}
        </div>
    );
};

export default BillManager;