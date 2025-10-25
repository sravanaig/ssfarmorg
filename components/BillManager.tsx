import React, { useState, useMemo } from 'react';
import type { Customer, Delivery, Payment } from '../types';
import { ShareIcon, PrintIcon, WhatsAppIcon, DownloadIcon } from './Icons';
import { supabase } from '../lib/supabaseClient';

interface BillManagerProps {
  customers: Customer[];
  deliveries: Delivery[];
  setDeliveries: React.Dispatch<React.SetStateAction<Delivery[]>>;
  payments: Payment[];
}

const BillManager: React.FC<BillManagerProps> = ({ customers, deliveries, setDeliveries, payments }) => {
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | ''>('');
  const [billingMonth, setBillingMonth] = useState<string>(`${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`);

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
      deliveriesForPeriod: customerDeliveries,
      payments,
      totalQuantity,
      totalAmount,
      totalPaid,
      balance,
      previousBalance
    };
  }, [selectedCustomerId, billingMonth, customers, deliveries, payments]);
  
  const handlePrint = () => {
    window.print();
  };
  
  const generateBillMessage = () => {
    if (!billDetails) return '';

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

    return `
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
  };
  
  const handleShareBill = async () => {
    if (!billDetails) return;
    const message = generateBillMessage();

    if (navigator.share) {
        try {
            await navigator.share({
                title: `Milk Bill for ${billDetails.customer.name}`,
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

const handleSendWhatsApp = () => {
    if (!billDetails) return;

    const message = generateBillMessage();
    
    let phoneNumber = billDetails.customer.phone.replace(/\D/g, '');
    if (phoneNumber.length === 10) {
        phoneNumber = `91${phoneNumber}`; // Prepend country code for India
    } else if (phoneNumber.length === 0) {
         alert("Customer's phone number is not valid or available.");
         return;
    }
    
    const whatsappUrl = `https://wa.me/${phoneNumber}?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, '_blank');
};


const handleDownloadPdf = () => {
    if (!billDetails) return;

    const { jsPDF } = (window as any).jspdf;
    if (!jsPDF) {
        alert("PDF generation library is not loaded. Please try again.");
        return;
    }

    const doc = new jsPDF();
    const {
        customer,
        totalQuantity,
        totalAmount,
        totalPaid,
        balance,
        previousBalance,
        deliveriesForPeriod,
        period,
    } = billDetails;

    // 1. Title
    doc.setFontSize(20);
    doc.text('ssfatmorganic - Milk Bill', 14, 22);

    // 2. Customer Info
    doc.setFontSize(12);
    doc.text(`Customer: ${customer.name}`, 14, 40);
    doc.text(`Address: ${customer.address}`, 14, 46);
    doc.text(`Phone: ${customer.phone}`, 14, 52);
    doc.text(`Billing Period: ${period}`, 14, 58);

    // 3. Deliveries Table
    const tableColumn = ["Date", "Quantity (L)"];
    const tableRows: (string | number)[][] = deliveriesForPeriod.map(delivery => [
        new Date(delivery.date + 'T00:00:00Z').toLocaleDateString('en-CA', { timeZone: 'UTC' }),
        delivery.quantity.toFixed(2)
    ]);

    (doc as any).autoTable({
      head: [tableColumn],
      body: tableRows,
      startY: 70,
      theme: 'grid',
      headStyles: { fillColor: [34, 139, 34] }, // A nice green color
    });
    
    const finalY = (doc as any).lastAutoTable.finalY || 80;

    // 4. Summary
    doc.setFontSize(12);
    doc.text('Summary', 14, finalY + 10);

    const summaryX = 14;
    const valueX = 195; // Align to the right
    let summaryY = finalY + 18;

    const addSummaryLine = (label: string, value: string, isBold = false) => {
        if (isBold) doc.setFont(undefined, 'bold');
        doc.text(label, summaryX, summaryY);
        doc.text(value, valueX, summaryY, { align: 'right' });
        if (isBold) doc.setFont(undefined, 'normal');
        summaryY += 7;
    };
    
    addSummaryLine('Previous Balance:', `₹${previousBalance.toFixed(2)}`);
    addSummaryLine('This Month\'s Bill:', `₹${totalAmount.toFixed(2)}`);
    
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`(Total Quantity: ${totalQuantity.toFixed(2)} L @ ₹${customer.milkPrice.toFixed(2)}/L)`, summaryX + 4, summaryY, {align: 'left'});
    summaryY += 7;
    doc.setFontSize(12);
    doc.setTextColor(0);

    addSummaryLine('Total Amount Due:', `₹${(previousBalance + totalAmount).toFixed(2)}`);
    addSummaryLine('Payments Received:', `- ₹${totalPaid.toFixed(2)}`);

    doc.setLineWidth(0.5);
    doc.line(summaryX, summaryY - 3, valueX, summaryY - 3);

    doc.setFontSize(14);
    addSummaryLine('Outstanding Balance:', `₹${balance.toFixed(2)}`, true);

    // 5. Save the PDF
    const [year, month] = billingMonth.split('-');
    const monthName = new Date(parseInt(year), parseInt(month) - 1, 1).toLocaleString('default', { month: 'long' });
    const fileName = `Bill-${customer.name.replace(/\s/g, '_')}-${monthName}-${year}.pdf`;
    doc.save(fileName);
};


  const handleDeliveryChange = async (date: string, quantityStr: string) => {
    if (!selectedCustomerId) return;

    const quantity = parseFloat(quantityStr);
    const existingDelivery = deliveries.find(d => d.customerId === selectedCustomerId && d.date === date);

    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Not authenticated");

        if (!isNaN(quantity) && quantity > 0) {
            // Upsert (create or update)
            const { data, error } = await supabase
                .from('deliveries')
                .upsert({
                    id: existingDelivery?.id,
                    customerId: selectedCustomerId,
                    date: date,
                    quantity: quantity,
                    userId: user.id,
                }, { onConflict: 'customerId,date' })
                .select()
                .single();

            if (error) throw error;

            if (data) {
                setDeliveries(prev => {
                    const updatedDelivery = data as Delivery;
                    const index = prev.findIndex(d => d.id === updatedDelivery.id);
                    if (index !== -1) { // Update
                        const newDeliveries = [...prev];
                        newDeliveries[index] = updatedDelivery;
                        return newDeliveries;
                    } else { // Insert
                        return [...prev, updatedDelivery];
                    }
                });
            }
        } else if (existingDelivery) {
            // Delete
            const { error } = await supabase.from('deliveries').delete().eq('id', existingDelivery.id);
            if (error) throw error;
            setDeliveries(prev => prev.filter(d => d.id !== existingDelivery.id));
        }
    } catch (error: any) {
        alert(`Error updating delivery: ${error.message}`);
    }
  };

  const datesOfMonth = useMemo(() => {
    if (!billingMonth) return [];
    const [year, month] = billingMonth.split('-').map(Number);
    const daysInMonth = new Date(year, month, 0).getDate();
    return Array.from({ length: daysInMonth }, (_, i) => {
        const day = i + 1;
        const d = new Date(Date.UTC(year, month - 1, day));
        return d.toISOString().split('T')[0];
    });
  }, [billingMonth]);

  const deliveryMap = useMemo(() => {
    if (!billDetails) return new Map<string, Delivery>();
    return new Map(billDetails.deliveriesForPeriod.map(d => [d.date, d]));
  }, [billDetails]);


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
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div>
                <h4 className="text-lg font-semibold text-gray-800 mb-2">Deliveries for {new Date(billingMonth + '-02').toLocaleString('default', { month: 'long', year: 'numeric' })}</h4>
                <p className="text-sm text-gray-500 mb-2">You can edit quantities below. Set quantity to 0 to remove a delivery.</p>
                <div className="overflow-y-auto max-h-80 mb-4 border rounded-md">
                    <table className="w-full text-sm">
                        <thead className="bg-gray-50 sticky top-0 z-10">
                            <tr>
                                <th className="px-4 py-2 text-left font-medium text-gray-600">Date</th>
                                <th className="px-4 py-2 text-right font-medium text-gray-600">Quantity (L)</th>
                            </tr>
                        </thead>
                        <tbody>
                            {datesOfMonth.map(date => {
                                const delivery = deliveryMap.get(date);
                                const quantity = delivery ? delivery.quantity : '';
                                return (
                                    <tr key={date} className="border-t hover:bg-gray-50">
                                        <td className="px-4 py-1 text-gray-700">{new Date(date + 'T00:00:00Z').toLocaleDateString('en-GB', { timeZone: 'UTC', day: '2-digit', month: 'short' })}</td>
                                        <td className="px-4 py-1 text-right text-gray-700">
                                            <input
                                                type="number"
                                                step="0.5"
                                                min="0"
                                                placeholder="0"
                                                defaultValue={quantity}
                                                onBlur={(e) => {
                                                  const newQuantityVal = e.target.value === '' ? 0 : parseFloat(e.target.value);
                                                  const oldQuantity = delivery ? delivery.quantity : 0;
                                                  if (newQuantityVal !== oldQuantity) {
                                                      handleDeliveryChange(date, e.target.value);
                                                  }
                                                }}
                                                className="w-24 border border-gray-300 rounded-md shadow-sm py-1 px-2 text-right focus:outline-none focus:ring-blue-500 focus:border-blue-500 bg-gray-50"
                                            />
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
            <div>
              <h4 className="text-lg font-semibold text-gray-800 mb-2">Summary</h4>
              <div className="space-y-2 text-gray-700 bg-gray-50 p-4 rounded-lg">
                <p className="flex justify-between"><span>Previous Balance:</span> <strong>₹{billDetails.previousBalance.toFixed(2)}</strong></p>
                <p className="flex justify-between"><span>This Month's Bill:</span> <strong>₹{billDetails.totalAmount.toFixed(2)}</strong></p>
                <p className="flex justify-between text-sm text-gray-500 pl-4"><span>(Total Quantity: {billDetails.totalQuantity.toFixed(2)} L @ ₹{billDetails.customer.milkPrice.toFixed(2)}/L)</span></p>
                <p className="flex justify-between border-t pt-2 mt-2"><span>Total Amount Due:</span> <strong>₹{(billDetails.previousBalance + billDetails.totalAmount).toFixed(2)}</strong></p>
                <p className="flex justify-between"><span>Payments Received:</span> <strong className="text-green-600">- ₹{billDetails.totalPaid.toFixed(2)}</strong></p>
                <p className="flex justify-between text-xl font-bold border-t pt-2 mt-2 text-blue-600"><span>Outstanding Balance:</span> <span>₹{billDetails.balance.toFixed(2)}</span></p>
              </div>
            </div>
          </div>
           <div className="mt-8 flex flex-wrap justify-center items-center gap-4 print:hidden">
                <button onClick={handleSendWhatsApp} className="flex items-center px-6 py-2 bg-green-500 text-white rounded-lg shadow-sm hover:bg-green-600 transition-colors">
                    <WhatsAppIcon className="h-5 w-5 mr-2" />
                    Send via WhatsApp
                </button>
                <button onClick={handleShareBill} className="flex items-center px-6 py-2 bg-gray-600 text-white rounded-lg shadow-sm hover:bg-gray-700 transition-colors">
                    <ShareIcon className="h-5 w-5 mr-2" />
                    Share Bill
                </button>
                <button onClick={handlePrint} className="flex items-center px-6 py-2 bg-blue-600 text-white rounded-lg shadow-sm hover:bg-blue-700 transition-colors">
                    <PrintIcon className="h-5 w-5 mr-2" />
                    Print Bill
                </button>
                <button onClick={handleDownloadPdf} className="flex items-center px-6 py-2 bg-red-600 text-white rounded-lg shadow-sm hover:bg-red-700 transition-colors">
                    <DownloadIcon className="h-5 w-5 mr-2" />
                    Download PDF
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