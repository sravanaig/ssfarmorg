
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

const BillManager: React.FC<BillManagerProps> = ({ customers, deliveries, setDeliveries, payments, isReadOnly = false }) => {
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | ''>('');
  const [billingMonth, setBillingMonth] = useState<string>(`${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`);
  const [searchTerm, setSearchTerm] = useState('');
  const [editedQuantities, setEditedQuantities] = useState<Map<string, string>>(new Map());
  const [isSaving, setIsSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string | null>(null);
  const [isQrLoading, setIsQrLoading] = useState(false);

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
                // Fix: Changed incorrect 'deliveryDate' variable to 'paymentDate'.
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
                // Fix: Corrected typo from readDataURL to readAsDataURL.
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
    const paymentMessage = balance > 0
        ? `
*To Pay: ₹${balance.toFixed(2)}*
Please pay using UPI to: \`${upiId}\`
`
        : `*Bill is settled. Thank you!*`;

    return `
Hi ${customer.name},

Here is your milk bill for *${billingPeriod}*.

*Summary:*
- Previous Balance: ₹${previousBalance.toFixed(2)}
- This Month's Bill: ₹${totalAmount.toFixed(2)}
  (Total Quantity: ${totalQuantity.toFixed(2)} L)
- Payments Received: ₹${totalPaid.toFixed(2)}

-----------------------------------
*Outstanding Balance: ₹${balance.toFixed(2)}*
-----------------------------------

${paymentMessage}

Thank you,
*ssfarmorganic*
Contact: 7382601453
    `.trim().replace(/^\s+/gm, '');
  };

  const handleWhatsAppShare = () => {
    const message = generateBillMessage(selectedCustomerBillDetails);
    if (!message) return;
    const phone = selectedCustomerBillDetails?.customer.phone.replace('+', '');
    if (!phone) {
        alert('This customer does not have a phone number saved.');
        return;
    }
    const whatsappUrl = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, '_blank');
  };

  const generatePdf = async () => {
      if (!selectedCustomerBillDetails) return;
      
      const { customer, deliveriesForPeriod, totalQuantity, totalAmount, totalPaid, balance, previousBalance } = selectedCustomerBillDetails;

      // jsPDF is loaded from a script tag in index.html
      const { jsPDF } = (window as any).jspdf;
      const doc = new jsPDF();

      doc.setFontSize(20);
      doc.text("ssfarmorganic", 14, 22);
      doc.setFontSize(12);
      doc.text("Medipally, Hyderabad", 14, 28);
      doc.text("Phone: 7382601453", 14, 34);
      
      doc.setFontSize(16);
      doc.text("Tax Invoice", 190, 22, { align: 'right' });
      
      doc.setFontSize(12);
      doc.text(`Bill To:`, 14, 50);
      doc.text(customer.name, 14, 56);
      doc.text(customer.address, 14, 62);
      doc.text(customer.phone, 14, 68);

      const [year, month] = billingMonth.split('-');
      const billingPeriod = new Date(parseInt(year), parseInt(month) - 1, 1).toLocaleString('default', { month: 'long', year: 'numeric' });
      doc.text(`Billing Period: ${billingPeriod}`, 190, 56, { align: 'right' });

      (doc as any).autoTable({
          startY: 80,
          head: [['Date', 'Product', 'Quantity (L)', 'Rate (₹)', 'Amount (₹)']],
          body: deliveriesForPeriod.map(d => [
              new Date(d.date + 'T00:00:00Z').toLocaleDateString('en-GB', { timeZone: 'UTC' }),
              'Milk',
              d.quantity.toFixed(2),
              customer.milkPrice.toFixed(2),
              (d.quantity * customer.milkPrice).toFixed(2)
          ]),
          theme: 'striped',
          headStyles: { fillColor: [22, 160, 133] },
      });

      const finalY = (doc as any).lastAutoTable.finalY + 10;
      doc.setFontSize(12);
      
      const summaryX = 140;
      const valueX = 190;
      let currentY = finalY;

      doc.text('Previous Balance:', summaryX, currentY, { align: 'right' });
      doc.text(`₹${previousBalance.toFixed(2)}`, valueX, currentY, { align: 'right' });
      currentY += 7;
      
      doc.text('This Month Total:', summaryX, currentY, { align: 'right' });
      doc.text(`₹${totalAmount.toFixed(2)}`, valueX, currentY, { align: 'right' });
      currentY += 7;

      doc.text('Payments Received:', summaryX, currentY, { align: 'right' });
      doc.text(`- ₹${totalPaid.toFixed(2)}`, valueX, currentY, { align: 'right' });
      currentY += 7;
      
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('Outstanding Balance:', summaryX, currentY, { align: 'right' });
      doc.text(`₹${balance.toFixed(2)}`, valueX, currentY, { align: 'right' });
      
      if (qrCodeDataUrl && balance > 0) {
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.text('Scan to Pay:', 14, finalY);
        doc.addImage(qrCodeDataUrl, 'PNG', 14, finalY + 2, 40, 40);
      }

      doc.save(`bill-${customer.name.replace(' ', '_')}-${billingMonth}.pdf`);
  };
  
  const handleQuantityChange = (date: string, newQuantityStr: string) => {
    setEditedQuantities(prev => new Map(prev).set(date, newQuantityStr));
  };
  
  const handleSaveChanges = async () => {
    if (!selectedCustomerBillDetails || editedQuantities.size === 0) {
        alert("No changes to save.");
        return;
    }
    setIsSaving(true);
    try {
        const deliveriesToUpsert = Array.from(editedQuantities.entries()).map(([date, quantityStr]) => {
            const quantity = quantityStr === '' ? 0 : parseFloat(quantityStr);
            return {
                customerId: selectedCustomerBillDetails.customer.id,
                date,
                quantity
            };
        });

        const { data, error } = await supabase.from('deliveries').upsert(deliveriesToUpsert, { onConflict: 'customerId,date' }).select();

        if (error) throw error;

        if (data) {
            setDeliveries(prev => {
                const updatedDeliveriesMap = new Map(prev.map(d => [`${d.customerId}-${d.date}`, d]));
                (data as Delivery[]).forEach(d => { updatedDeliveriesMap.set(`${d.customerId}-${d.date}`, d); });
                return Array.from(updatedDeliveriesMap.values());
            });
        }
        setEditedQuantities(new Map());
        alert("Changes saved successfully!");
    } catch (error: any) {
        alert(`Error saving changes: ${getFriendlyErrorMessage(error)}`);
    } finally {
        setIsSaving(false);
    }
  };
  
  const handleImportClick = () => fileInputRef.current?.click();

  const handleFileImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const text = e.target?.result;
        if (typeof text !== 'string') {
          alert('Error reading file content or file is empty.');
          return;
        }
        const rows = text.split('\n').filter(row => row.trim() !== '');
        if (rows.length < 2) { alert("CSV data is empty or contains only a header."); return; }
        const header = rows[0].split(',').map(h => h.trim());
        const requiredHeaders = ['customerName', 'date', 'quantity'];
        if (!requiredHeaders.every(h => header.includes(h))) { alert(`Invalid CSV header. Required headers are: ${requiredHeaders.join(', ')}`); return; }
        
        const customerMapByName = new Map(customers.map(c => [c.name.toLowerCase(), c.id]));
        const deliveriesToUpsert = rows.slice(1).map(row => {
          const values = row.split(',');
          const customerName = values[header.indexOf('customerName')].trim().toLowerCase();
          const customerId = customerMapByName.get(customerName);
          if (!customerId) return null;
          return {
            customerId: customerId,
            date: values[header.indexOf('date')].trim(),
            quantity: parseFloat(values[header.indexOf('quantity')])
          };
        }).filter(d => d && !isNaN(d.quantity));

        if (deliveriesToUpsert.length === 0) {
            alert("No valid delivery data found to import.");
            return;
        }

        const { data, error } = await supabase.from('deliveries').upsert(deliveriesToUpsert as any[], { onConflict: 'customerId,date' }).select();

        if (error) throw error;
        
        if (data) {
             setDeliveries(prev => {
                const updatedDeliveriesMap = new Map(prev.map(d => [`${d.customerId}-${d.date}`, d]));
                (data as Delivery[]).forEach(d => { updatedDeliveriesMap.set(`${d.customerId}-${d.date}`, d); });
                return Array.from(updatedDeliveriesMap.values());
            });
            alert(`${data.length} delivery records imported/updated successfully.`);
        }
      } catch (error: any) {
        alert("An error occurred while importing: " + getFriendlyErrorMessage(error));
      } finally {
        if(fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="print:p-0">
        <div className="flex flex-col md:flex-row justify-between md:items-center mb-6 gap-4 print:hidden">
            <h2 className="text-3xl font-bold text-gray-800">Generate Bills</h2>
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 w-full md:w-auto">
                <div className="relative w-full sm:w-64">
                    <input type="text" placeholder="Search for a customer..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 pl-10 focus:outline-none focus:ring-blue-500 focus:border-blue-500" />
                    <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                </div>
                <input type="month" value={billingMonth} onChange={e => setBillingMonth(e.target.value)} className="w-full sm:w-auto border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500" />
            </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1 bg-white p-4 rounded-lg shadow-md print:hidden">
                <h3 className="font-semibold text-lg mb-2">Customers</h3>
                 <ul className="space-y-2 max-h-[70vh] overflow-y-auto">
                    {allBillDetails.map(details => (
                        <li key={details.customer.id}>
                            <button
                                onClick={() => setSelectedCustomerId(details.customer.id)}
                                className={`w-full text-left p-3 rounded-md transition-colors ${selectedCustomerId === details.customer.id ? 'bg-blue-600 text-white shadow' : 'bg-gray-50 hover:bg-gray-100'}`}
                            >
                                <div className="flex justify-between items-center">
                                    <span className="font-medium">{details.customer.name}</span>
                                    <span className={`text-sm font-semibold ${details.balance > 0 ? 'text-red-500' : 'text-green-600'} ${selectedCustomerId === details.customer.id ? 'text-white' : ''}`}>
                                        ₹{details.balance.toFixed(2)}
                                    </span>
                                </div>
                            </button>
                        </li>
                    ))}
                </ul>
            </div>

            <div className="lg:col-span-2">
                 <div id="bill-content" className="bg-white p-6 rounded-lg shadow-md">
                    {selectedCustomerBillDetails ? (
                        <>
                            <div className="flex justify-between items-start mb-6">
                                <div>
                                    <h3 className="text-2xl font-bold text-gray-800">{selectedCustomerBillDetails.customer.name}</h3>
                                    <p className="text-gray-500">{selectedCustomerBillDetails.customer.address}</p>
                                </div>
                                <div className="flex gap-2 print:hidden">
                                    <button onClick={handleWhatsAppShare} className="p-2 bg-green-500 text-white rounded-full hover:bg-green-600" title="Share on WhatsApp"><WhatsAppIcon className="h-5 w-5"/></button>
                                    <button onClick={generatePdf} className="p-2 bg-red-500 text-white rounded-full hover:bg-red-600" title="Download PDF"><DownloadIcon className="h-5 w-5"/></button>
                                    <button onClick={handlePrint} className="p-2 bg-gray-600 text-white rounded-full hover:bg-gray-700" title="Print Bill"><PrintIcon className="h-5 w-5"/></button>
                                </div>
                            </div>

                             <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6 text-center">
                                <div className="p-3 bg-gray-50 rounded-lg"><h4 className="text-sm font-medium text-gray-500">Previous Balance</h4><p className="text-lg font-bold">₹{selectedCustomerBillDetails.previousBalance.toFixed(2)}</p></div>
                                <div className="p-3 bg-gray-50 rounded-lg"><h4 className="text-sm font-medium text-gray-500">This Month's Bill</h4><p className="text-lg font-bold">₹{selectedCustomerBillDetails.totalAmount.toFixed(2)}</p></div>
                                <div className={`p-3 rounded-lg ${selectedCustomerBillDetails.balance > 0 ? 'bg-red-100' : 'bg-green-100'}`}><h4 className={`text-sm font-medium ${selectedCustomerBillDetails.balance > 0 ? 'text-red-700' : 'text-green-700'}`}>Outstanding</h4><p className={`text-xl font-extrabold ${selectedCustomerBillDetails.balance > 0 ? 'text-red-600' : 'text-green-600'}`}>₹{selectedCustomerBillDetails.balance.toFixed(2)}</p></div>
                            </div>
                            
                            <h4 className="font-semibold mb-2">Delivery Details for the month:</h4>
                            <div className="overflow-y-auto max-h-80 border rounded-lg">
                                <table className="w-full text-sm">
                                    <thead className="bg-gray-50 sticky top-0">
                                        <tr>
                                            <th className="px-4 py-2 text-left font-medium text-gray-600">Date</th>
                                            <th className="px-4 py-2 text-right font-medium text-gray-600">Quantity (L)</th>
                                            <th className="px-4 py-2 text-right font-medium text-gray-600">Amount (₹)</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {selectedCustomerBillDetails.deliveriesForPeriod.map((d) => {
                                            const displayQuantity = editedQuantities.get(d.date) ?? d.quantity.toString();
                                            return (
                                                <tr key={d.id} className="border-t">
                                                    <td className="px-4 py-2">{new Date(d.date + 'T00:00:00Z').toLocaleDateString('en-GB', { timeZone: 'UTC', day: '2-digit', month: 'short' })}</td>
                                                    <td className="px-4 py-2 text-right">
                                                        <QuantityInput
                                                          value={displayQuantity}
                                                          onChange={(newValue) => handleQuantityChange(d.date, newValue)}
                                                          readOnly={isReadOnly}
                                                          inputClassName="w-20"
                                                        />
                                                    </td>
                                                    <td className="px-4 py-2 text-right">{(parseFloat(displayQuantity) * selectedCustomerBillDetails.customer.milkPrice).toFixed(2)}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                            {editedQuantities.size > 0 && !isReadOnly && (
                                <div className="mt-4 flex justify-end">
                                    <button onClick={handleSaveChanges} disabled={isSaving} className="px-6 py-2 bg-blue-600 text-white rounded-lg shadow-sm hover:bg-blue-700 transition-colors disabled:opacity-50">
                                        {isSaving ? 'Saving...' : 'Save Changes'}
                                    </button>
                                </div>
                            )}

                        </>
                    ) : (
                        <div className="text-center py-20">
                            <h3 className="text-lg font-medium text-gray-700">Select a Customer</h3>
                            <p className="mt-1 text-sm text-gray-500">Choose a customer from the list to view their bill.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    </div>
  );
};

export default BillManager;