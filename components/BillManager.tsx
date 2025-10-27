import React, { useState, useMemo, useEffect } from 'react';
import type { Customer, Delivery, Payment } from '../types';
import { ShareIcon, PrintIcon, WhatsAppIcon, DownloadIcon, SearchIcon, ScanIcon } from './Icons';
import { supabase } from '../lib/supabaseClient';

interface BillManagerProps {
  customers: Customer[];
  deliveries: Delivery[];
  setDeliveries: React.Dispatch<React.SetStateAction<Delivery[]>>;
  payments: Payment[];
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

const BillManager: React.FC<BillManagerProps> = ({ customers, deliveries, setDeliveries, payments }) => {
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | ''>('');
  const [billingMonth, setBillingMonth] = useState<string>(`${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`);
  const [searchTerm, setSearchTerm] = useState('');
  const [editedQuantities, setEditedQuantities] = useState<Map<string, string>>(new Map());
  const [isSaving, setIsSaving] = useState(false);

  const activeCustomers = useMemo(() => customers.filter(c => c.status === 'active'), [customers]);

  const filteredCustomers = useMemo(() => {
    const lowercasedFilter = searchTerm.toLowerCase().trim();
    if (!lowercasedFilter) {
      return activeCustomers;
    }
    return activeCustomers.filter(customer =>
      customer.name.toLowerCase().includes(lowercasedFilter)
    );
  }, [activeCustomers, searchTerm]);

  useEffect(() => {
    // If the selected customer is filtered out, deselect them and clear pending changes
    if (selectedCustomerId && !filteredCustomers.some(c => c.id === selectedCustomerId)) {
      setSelectedCustomerId('');
    }
  }, [filteredCustomers, selectedCustomerId]);

  useEffect(() => {
    // Clear any pending edits when the customer or month changes
    setEditedQuantities(new Map());
  }, [selectedCustomerId, billingMonth]);


  const allBillDetails = useMemo((): BillDetails[] => {
    if (!billingMonth) return [];

    const [year, month] = billingMonth.split('-').map(Number);
    const startDate = new Date(Date.UTC(year, month - 1, 1));
    const endDate = new Date(Date.UTC(year, month, 0));

    return filteredCustomers.map(customer => {
        // Previous Balance Calculation
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
        const previousBalance = totalHistoricalDue - totalHistoricalPaid;

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
  }, [billingMonth, filteredCustomers, deliveries, payments]);

  const selectedCustomerBillDetails = useMemo(() => {
    if (!selectedCustomerId) return null;
    return allBillDetails.find(d => d.customer.id === selectedCustomerId) || null;
  }, [selectedCustomerId, allBillDetails]);

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

Here is your milk bill summary from *ssfarmorganic* for *${billingPeriod}*.

*Summary*
-----------------------------------
Previous Balance: ₹${previousBalance.toFixed(2)}
This Month's Bill: ₹${totalAmount.toFixed(2)}
  (Total Quantity: ${totalQuantity.toFixed(2)} L)
Payments Received: ₹${totalPaid.toFixed(2)}
-----------------------------------
*Outstanding Balance: ₹${balance.toFixed(2)}*
${paymentMessage}

Thank you for your business!
`.trim().replace(/^\s+/gm, '');
  };
  
  const handleShareBill = async () => {
    if (!selectedCustomerBillDetails) return;

    const message = generateBillMessage(selectedCustomerBillDetails);
    const { balance, customer } = selectedCustomerBillDetails;

    // If no balance or navigator.share is not available, fallback to clipboard
    if (balance <= 0 || !navigator.share) {
      navigator.clipboard.writeText(message).then(() => {
        alert(balance <= 0 ? 'Bill is settled. Copied to clipboard!' : 'Share API not supported. Bill details copied to clipboard!');
      });
      return;
    }

    try {
      // Generate QR code URL
      const [year, month] = billingMonth.split('-');
      const billingPeriodForNote = new Date(parseInt(year), parseInt(month) - 1, 1).toLocaleString('default', { month: 'short', year: 'numeric' });
      const upiLink = `upi://pay?pa=9959202010@upi&pn=ssfarmorganic&am=${balance.toFixed(2)}&tn=Bill for ${billingPeriodForNote}`;
      const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(upiLink)}`;
      
      // Fetch QR code as a blob
      const response = await fetch(qrCodeUrl);
      if (!response.ok) throw new Error('Could not fetch QR code image.');
      const blob = await response.blob();
      const qrFile = new File([blob], `ssfarmorganic_qr_bill.png`, { type: 'image/png' });

      // Check if files can be shared
      if (navigator.canShare && navigator.canShare({ files: [qrFile] })) {
        // Share text and QR code image
        await navigator.share({
          title: `Milk Bill for ${customer.name}`,
          text: message,
          files: [qrFile],
        });
      } else {
        // Fallback for devices that can't share files (e.g., some desktop browsers)
        await navigator.share({
          title: `Milk Bill for ${customer.name}`,
          text: message,
        });
      }
    } catch (error) {
      console.error('Error sharing with QR code:', error);
      // Fallback if any part of the sharing process fails
      navigator.clipboard.writeText(message).then(() => alert('Sharing QR failed. Bill text copied to clipboard!'));
    }
  };


  const handleSendWhatsApp = (details: BillDetails | null) => {
    if (!details) return;
    const message = generateBillMessage(details);
    let phoneNumber = details.customer.phone.replace(/\D/g, '');
    if (phoneNumber.length === 10) phoneNumber = `91${phoneNumber}`;
    if (!phoneNumber) {
        alert("Customer's phone number is not valid or available.");
        return;
    }
    const whatsappUrl = `https://wa.me/${phoneNumber}?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, '_blank');
  };

  const generateBillPage = (doc: any, details: BillDetails) => {
    const { customer, totalQuantity, totalAmount, totalPaid, balance, previousBalance, deliveriesForPeriod, period } = details;
    doc.setFontSize(20);
    doc.text('ssfarmorganic - Milk Bill', 14, 22);
    doc.setFontSize(12);
    doc.text(`Customer: ${customer.name}`, 14, 40);
    doc.text(`Address: ${customer.address}`, 14, 46);
    doc.text(`Phone: ${customer.phone}`, 14, 52);
    doc.text(`Billing Period: ${period}`, 14, 58);
    const tableColumn = ["Date", "Quantity (L)"];
    const tableRows = deliveriesForPeriod.map(d => [new Date(d.date + 'T00:00:00Z').toLocaleDateString('en-CA', { timeZone: 'UTC' }), d.quantity.toFixed(2)]);
    doc.autoTable({ head: [tableColumn], body: tableRows, startY: 70, theme: 'grid', headStyles: { fillColor: [34, 139, 34] } });
    const finalY = doc.lastAutoTable.finalY || 80;
    doc.setFontSize(12);
    doc.text('Summary', 14, finalY + 10);
    const summaryX = 14, valueX = 195;
    let summaryY = finalY + 18;
    const addLine = (label: string, value: string, isBold = false) => {
        if (isBold) doc.setFont(undefined, 'bold');
        doc.text(label, summaryX, summaryY);
        doc.text(value, valueX, summaryY, { align: 'right' });
        if (isBold) doc.setFont(undefined, 'normal');
        summaryY += 7;
    };
    addLine('Previous Balance:', `₹${previousBalance.toFixed(2)}`);
    addLine('This Month\'s Bill:', `₹${totalAmount.toFixed(2)}`);
    doc.setFontSize(10); doc.setTextColor(100);
    doc.text(`(Total Quantity: ${totalQuantity.toFixed(2)} L @ ₹${customer.milkPrice.toFixed(2)}/L)`, summaryX + 4, summaryY);
    summaryY += 7; doc.setFontSize(12); doc.setTextColor(0);
    addLine('Total Amount Due:', `₹${(previousBalance + totalAmount).toFixed(2)}`);
    addLine('Payments Received:', `- ₹${totalPaid.toFixed(2)}`);
    doc.setLineWidth(0.5); doc.line(summaryX, summaryY - 3, valueX, summaryY - 3);
    doc.setFontSize(14); addLine('Outstanding Balance:', `₹${balance.toFixed(2)}`, true);
  };

  const handleDownloadPdf = () => {
    if (!selectedCustomerBillDetails) return;
    const { jsPDF } = (window as any).jspdf;
    if (!jsPDF) return alert("PDF generation library is not loaded.");
    const doc = new jsPDF();
    generateBillPage(doc, selectedCustomerBillDetails);
    const [year, month] = billingMonth.split('-');
    const monthName = new Date(parseInt(year), parseInt(month) - 1).toLocaleString('default', { month: 'long' });
    doc.save(`Bill-${selectedCustomerBillDetails.customer.name.replace(/\s/g, '_')}-${monthName}-${year}.pdf`);
  };

  const handleDownloadAllPdfs = () => {
    const { jsPDF } = (window as any).jspdf;
    if (!jsPDF) return alert("PDF generation library is not loaded.");
    const doc = new jsPDF();
    allBillDetails.forEach((details, index) => {
        if (index > 0) doc.addPage();
        generateBillPage(doc, details);
    });
    const [year, month] = billingMonth.split('-');
    const monthName = new Date(parseInt(year), parseInt(month) - 1).toLocaleString('default', { month: 'long' });
    doc.save(`All_Bills-${monthName}-${year}.pdf`);
  };

  const handleExportSummary = () => {
    const headers = ['Customer Name', 'Previous Balance', 'Current Month Amount', 'Payments Received', 'Outstanding Balance'];
    const rows = allBillDetails.map(d => [
        d.customer.name,
        d.previousBalance.toFixed(2),
        d.totalAmount.toFixed(2),
        d.totalPaid.toFixed(2),
        d.balance.toFixed(2)
    ].join(','));
    const csvContent = [headers.join(','), ...rows].join('\n');
    downloadCSV(csvContent, `billing_summary_${billingMonth}.csv`);
  };

  const datesOfMonth = useMemo(() => {
    if (!billingMonth) return [];
    const [year, month] = billingMonth.split('-').map(Number);
    const daysInMonth = new Date(year, month, 0).getDate();
    return Array.from({ length: daysInMonth }, (_, i) => new Date(Date.UTC(year, month - 1, i + 1)).toISOString().split('T')[0]);
  }, [billingMonth]);

  const deliveryMap = useMemo(() => {
    if (!selectedCustomerBillDetails) return new Map<string, Delivery>();
    return new Map(selectedCustomerBillDetails.deliveriesForPeriod.map(d => [d.date, d]));
  }, [selectedCustomerBillDetails]);
  
  const pendingDeliveryChanges = useMemo(() => {
    const changes = new Map<string, number>();
    for (const [date, qtyStr] of editedQuantities.entries()) {
        const originalQty = deliveryMap.get(date)?.quantity ?? 0;
        const newQty = qtyStr === '' ? 0 : parseFloat(qtyStr);

        // A change is valid if it's a number and not equal to the original quantity
        if (!isNaN(newQty) && newQty !== originalQty) {
            changes.set(date, newQty);
        }
    }
    return changes;
  }, [editedQuantities, deliveryMap]);

  const getDisplayQuantityForDate = (date: string): string => {
    if (editedQuantities.has(date)) {
        return editedQuantities.get(date)!;
    }
    return deliveryMap.get(date)?.quantity.toString() ?? '';
  };
  
  const handleDeliveryInputChange = (date: string, quantityStr: string) => {
    // Allow only valid numbers (including decimals) or an empty string
    if (/^[0-9]*\.?[0-9]*$/.test(quantityStr)) {
        setEditedQuantities(prev => new Map(prev).set(date, quantityStr));
    }
  };
  
  const handleSaveChanges = async () => {
    if (!selectedCustomerId || pendingDeliveryChanges.size === 0) return;
    setIsSaving(true);
    
    try {
        const changes = Array.from(pendingDeliveryChanges.entries());

        const deliveriesToUpsert = changes
            .filter(([, quantity]) => quantity > 0)
            .map(([date, quantity]) => ({
                customerId: selectedCustomerId,
                date,
                quantity,
            }));
            
        const datesToDelete = changes
            .filter(([, quantity]) => quantity === 0)
            .map(([date]) => date)
            .filter(date => deliveryMap.has(date));

        const upsertPromise = deliveriesToUpsert.length > 0
            ? supabase.from('deliveries').upsert(deliveriesToUpsert, { onConflict: 'customerId,date' }).select()
            : Promise.resolve({ data: [], error: null });

        const deletePromise = datesToDelete.length > 0
            ? supabase.from('deliveries').delete().eq('customerId', selectedCustomerId).in('date', datesToDelete)
            : Promise.resolve({ error: null });

        const [upsertResult, deleteResult] = await Promise.all([upsertPromise, deletePromise]);
        
        if (upsertResult.error) throw upsertResult.error;
        if (deleteResult.error) throw deleteResult.error;

        setDeliveries(prev => {
            const deliveriesAfterDeletion = prev.filter(d => 
                !(d.customerId === selectedCustomerId && datesToDelete.includes(d.date))
            );
            const updatedDeliveriesMap = new Map(deliveriesAfterDeletion.map(d => [`${d.customerId}-${d.date}`, d]));
            if (upsertResult.data) {
                (upsertResult.data as Delivery[]).forEach(d => {
                    updatedDeliveriesMap.set(`${d.customerId}-${d.date}`, d);
                });
            }
            return Array.from(updatedDeliveriesMap.values());
        });

        setEditedQuantities(new Map());
        alert('Changes saved successfully!');
    } catch (error: any) {
        alert(`Error saving changes: ${error.message}`);
    } finally {
        setIsSaving(false);
    }
  };

  const saveButtonText = isSaving 
    ? 'Saving...' 
    : `Save Changes ${pendingDeliveryChanges.size > 0 ? `(${pendingDeliveryChanges.size})` : ''}`;

  return (
    <div>
      <div className="flex flex-col md:flex-row justify-between md:items-center mb-6 gap-4 p-4 bg-white rounded-lg shadow-sm print:hidden">
        <h2 className="text-3xl font-bold text-gray-800">Generate Bills</h2>
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 w-full md:w-auto">
            <div className="relative w-full sm:w-64">
                <input type="text" placeholder="Search for a customer..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 pl-10 focus:outline-none focus:ring-blue-500 focus:border-blue-500" />
                <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
            </div>
            <input type="month" value={billingMonth} onChange={e => setBillingMonth(e.target.value)} className="w-full sm:w-auto border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500" />
        </div>
      </div>

      {selectedCustomerBillDetails ? (
        <div className="bg-white p-6 md:p-8 rounded-lg shadow-lg">
           <button onClick={() => setSelectedCustomerId('')} className="text-blue-600 hover:underline mb-4 print:hidden">&larr; Back to Monthly Summary</button>
          <div className="flex justify-between items-start mb-6 border-b pb-4">
            <div>
              <h3 className="text-2xl font-bold text-gray-900">{selectedCustomerBillDetails.customer.name}</h3>
              <p className="text-gray-600">{selectedCustomerBillDetails.customer.address}</p>
              <p className="text-gray-600">{selectedCustomerBillDetails.customer.phone}</p>
            </div>
            <div className="text-right">
              <h4 className="text-xl font-semibold text-gray-800">Bill Details</h4>
              <p className="text-gray-600">Period: {selectedCustomerBillDetails.period}</p>
            </div>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div>
                <h4 className="text-lg font-semibold text-gray-800 mb-2">Deliveries for {new Date(billingMonth + '-02').toLocaleString('default', { month: 'long', year: 'numeric' })}</h4>
                <p className="text-sm text-gray-500 mb-2">You can edit quantities below. Clear the input to remove a delivery.</p>
                <div className="overflow-y-auto max-h-80 mb-4 border rounded-md">
                    <table className="w-full text-sm">
                        <thead className="bg-gray-50 sticky top-0 z-10"><tr><th className="px-4 py-2 text-left font-medium text-gray-600">Date</th><th className="px-4 py-2 text-right font-medium text-gray-600">Quantity (L)</th></tr></thead>
                        <tbody>
                            {datesOfMonth.map(date => (
                                    <tr key={date} className="border-t hover:bg-gray-50">
                                        <td className="px-4 py-1 text-gray-700">{new Date(date + 'T00:00:00Z').toLocaleDateString('en-GB', { timeZone: 'UTC', day: '2-digit', month: 'short' })}</td>
                                        <td className="px-4 py-1 text-right">
                                            <input 
                                                type="text"
                                                pattern="[0-9]*\.?[0-9]*"
                                                placeholder="0"
                                                value={getDisplayQuantityForDate(date)}
                                                onChange={(e) => handleDeliveryInputChange(date, e.target.value)}
                                                className="w-24 border border-gray-300 rounded-md shadow-sm py-1 px-2 text-right focus:outline-none focus:ring-blue-500 focus:border-blue-500 bg-gray-50"
                                            />
                                        </td>
                                    </tr>
                                ))}
                        </tbody>
                    </table>
                </div>
            </div>
            <div>
              <h4 className="text-lg font-semibold text-gray-800 mb-2">Summary</h4>
              <div className="space-y-2 text-gray-700 bg-gray-50 p-4 rounded-lg">
                <p className="flex justify-between"><span>Previous Balance:</span> <strong>₹{selectedCustomerBillDetails.previousBalance.toFixed(2)}</strong></p>
                <p className="flex justify-between"><span>This Month's Bill:</span> <strong>₹{selectedCustomerBillDetails.totalAmount.toFixed(2)}</strong></p>
                <p className="flex justify-between text-sm text-gray-500 pl-4"><span>(Total Quantity: {selectedCustomerBillDetails.totalQuantity.toFixed(2)} L @ ₹{selectedCustomerBillDetails.customer.milkPrice.toFixed(2)}/L)</span></p>
                <p className="flex justify-between border-t pt-2 mt-2"><span>Total Amount Due:</span> <strong>₹{(selectedCustomerBillDetails.previousBalance + selectedCustomerBillDetails.totalAmount).toFixed(2)}</strong></p>
                <p className="flex justify-between"><span>Payments Received:</span> <strong className="text-green-600">- ₹{selectedCustomerBillDetails.totalPaid.toFixed(2)}</strong></p>
                <p className="flex justify-between text-xl font-bold border-t pt-2 mt-2 text-blue-600"><span>Outstanding Balance:</span> <span>₹{selectedCustomerBillDetails.balance.toFixed(2)}</span></p>
              </div>
              {selectedCustomerBillDetails.balance > 0 && (() => {
                const [year, month] = billingMonth.split('-');
                const billingPeriodForNote = new Date(parseInt(year), parseInt(month) - 1, 1).toLocaleString('default', { month: 'short', year: 'numeric' });
                const upiLink = `upi://pay?pa=9959202010@upi&pn=ssfarmorganic&am=${selectedCustomerBillDetails.balance.toFixed(2)}&tn=Bill for ${billingPeriodForNote}`;
                const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(upiLink)}`;
                return (
                    <div className="mt-6">
                        <h4 className="text-lg font-semibold text-gray-800 mb-2">Pay with UPI</h4>
                        <div className="flex flex-col items-center bg-gray-50 p-4 rounded-lg border">
                            <img src={qrCodeUrl} alt="UPI QR Code for payment" className="w-48 h-48 rounded-md" />
                            <p className="mt-3 text-sm text-gray-800 font-medium flex items-center">
                                <ScanIcon className="h-4 w-4 mr-2 text-gray-500"/>
                                Scan to pay using any UPI app
                            </p>
                            <p className="font-mono text-sm mt-2 bg-gray-200 px-3 py-1 rounded-full text-gray-700">
                                9959202010@upi
                            </p>
                        </div>
                    </div>
                );
              })()}
            </div>
          </div>
           <div className="mt-8 flex flex-wrap justify-center items-center gap-4 print:hidden">
                <button onClick={() => handleSendWhatsApp(selectedCustomerBillDetails)} className="flex items-center px-6 py-2 bg-green-500 text-white rounded-lg shadow-sm hover:bg-green-600 transition-colors"><WhatsAppIcon className="h-5 w-5 mr-2" />Send via WhatsApp</button>
                <button onClick={handleShareBill} className="flex items-center px-6 py-2 bg-gray-600 text-white rounded-lg shadow-sm hover:bg-gray-700 transition-colors"><ShareIcon className="h-5 w-5 mr-2" />Share Bill</button>
                <button onClick={handlePrint} className="flex items-center px-6 py-2 bg-blue-600 text-white rounded-lg shadow-sm hover:bg-blue-700 transition-colors"><PrintIcon className="h-5 w-5 mr-2" />Print Bill</button>
                <button onClick={handleDownloadPdf} className="flex items-center px-6 py-2 bg-red-600 text-white rounded-lg shadow-sm hover:bg-red-700 transition-colors"><DownloadIcon className="h-5 w-5 mr-2" />Download PDF</button>
            </div>
            {pendingDeliveryChanges.size > 0 && (
                <div className="fixed bottom-0 right-0 left-0 lg:left-64 bg-white/90 backdrop-blur-sm border-t border-gray-200 z-40 shadow-lg">
                    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
                        <div className="flex justify-between items-center">
                            <span className="text-gray-700 font-medium">
                                You have {pendingDeliveryChanges.size} unsaved delivery change{pendingDeliveryChanges.size > 1 ? 's' : ''}.
                            </span>
                            <button 
                                onClick={handleSaveChanges} 
                                disabled={isSaving} 
                                className="px-6 py-2 text-sm font-semibold bg-blue-600 text-white rounded-lg shadow-sm hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {saveButtonText}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
      ) : (
        <div className="bg-white p-6 rounded-lg shadow-md">
            <div className="flex flex-col sm:flex-row justify-between sm:items-center mb-4 gap-4">
                <h3 className="text-xl font-semibold text-gray-800">Monthly Billing Summary</h3>
                <div className="flex items-center gap-2 flex-wrap">
                    <button onClick={handleExportSummary} className="flex items-center px-3 py-2 text-sm bg-gray-600 text-white rounded-lg shadow-sm hover:bg-gray-700 transition-colors"><DownloadIcon className="h-4 w-4 mr-2"/> Export Summary (CSV)</button>
                    <button onClick={handleDownloadAllPdfs} className="flex items-center px-3 py-2 text-sm bg-red-600 text-white rounded-lg shadow-sm hover:bg-red-700 transition-colors"><DownloadIcon className="h-4 w-4 mr-2"/> Download All Bills (PDF)</button>
                </div>
            </div>
            {filteredCustomers.length > 0 ? (
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left text-gray-500">
                        <thead className="text-xs text-gray-700 uppercase bg-gray-50">
                            <tr>
                                <th className="px-4 py-3">Customer Name</th>
                                <th className="px-4 py-3 text-right">Prev. Balance</th>
                                <th className="px-4 py-3 text-right">Current Bill</th>
                                <th className="px-4 py-3 text-right">Paid</th>
                                <th className="px-4 py-3 text-right">Outstanding Balance</th>
                                <th className="px-4 py-3 text-center">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {allBillDetails.map(details => (
                                <tr key={details.customer.id} className="bg-white border-b hover:bg-gray-50">
                                    <td className="px-4 py-2 font-medium text-gray-900">{details.customer.name}</td>
                                    <td className="px-4 py-2 text-right">₹{details.previousBalance.toFixed(2)}</td>
                                    <td className="px-4 py-2 text-right">₹{details.totalAmount.toFixed(2)}</td>
                                    <td className="px-4 py-2 text-right text-green-600">₹{details.totalPaid.toFixed(2)}</td>
                                    <td className={`px-4 py-2 text-right font-semibold ${details.balance > 0 ? 'text-red-600' : 'text-green-600'}`}>₹{details.balance.toFixed(2)}</td>
                                    <td className="px-4 py-2 text-center">
                                        <div className="flex items-center justify-center gap-2">
                                            <button onClick={() => setSelectedCustomerId(details.customer.id)} className="text-blue-600 hover:underline text-xs font-semibold">View/Edit</button>
                                            <button onClick={() => handleSendWhatsApp(details)} aria-label="Send via WhatsApp" className="text-green-500 hover:text-green-700 p-1"><WhatsAppIcon className="h-5 w-5"/></button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : (
                <div className="text-center py-12 px-6">
                    <h3 className="text-lg font-medium text-gray-700">No Customers Match Your Search</h3>
                    <p className="mt-1 text-sm text-gray-500">Try a different name or clear the search field.</p>
                </div>
            )}
        </div>
      )}
    </div>
  );
};

export default BillManager;