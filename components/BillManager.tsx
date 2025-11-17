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

    if (balance <= 0) {
        navigator.clipboard.writeText(message).then(() => alert('Bill is settled. Copied to clipboard!'));
        return;
    }

    // Try to use Web Share API with image if available
    if (navigator.share && qrCodeDataUrl) {
        try {
            const blob = await (await fetch(qrCodeDataUrl)).blob();
            const qrFile = new File([blob], `ssfarmorganic_qr_bill.png`, { type: 'image/png' });

            if (navigator.canShare && navigator.canShare({ files: [qrFile] })) {
                await navigator.share({
                    title: `Milk Bill for ${customer.name}`,
                    text: message,
                    files: [qrFile],
                });
                return; // Shared successfully
            }
        } catch (error) {
            console.error('Error sharing with QR code:', error);
            // Fallthrough to share text only
        }
    }

    // Fallback for browsers that don't support file sharing or if QR fails
    if (navigator.share) {
        try {
            await navigator.share({
                title: `Milk Bill for ${customer.name}`,
                text: message,
            });
        } catch (error) {
            console.error('Error sharing text:', error);
            navigator.clipboard.writeText(message).then(() => alert('Sharing failed. Bill text copied to clipboard!'));
        }
    } else {
        navigator.clipboard.writeText(message).then(() => alert('Share API not supported. Bill details copied to clipboard!'));
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
    const margin = 14;
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const contentWidth = pageWidth - margin * 2;
    const rightAlignX = pageWidth - margin;

    // Header
    doc.setFontSize(20);
    doc.text('ssfarmorganic - Milk Bill', margin, 22);
 
    // Customer Info
    doc.setFontSize(12);
    doc.text(`Customer: ${customer.name}`, margin, 40);
    
    const addressLines = doc.splitTextToSize(`Address: ${customer.address}`, contentWidth);
    doc.text(addressLines, margin, 46);
    let currentY = 46 + (addressLines.length * 5); // Adjust Y based on number of address lines
    
    doc.text(`Phone: ${customer.phone}`, margin, currentY);
    currentY += 6;
    doc.text(`Billing Period: ${period}`, margin, currentY);
    currentY += 12;

    // Deliveries Table
    const tableColumn = ["Date", "Quantity (L)"];
    const tableRows = deliveriesForPeriod.map(d => [new Date(d.date + 'T00:00:00Z').toLocaleDateString('en-CA', { timeZone: 'UTC' }), d.quantity.toFixed(2)]);
    doc.autoTable({ 
        head: [tableColumn], 
        body: tableRows, 
        startY: currentY, 
        theme: 'grid', 
        headStyles: { fillColor: [34, 139, 34] } 
    });
    
    let finalY = doc.lastAutoTable.finalY;

    // --- Summary Section ---
    const summaryHeight = 80; // Approximate height needed for the summary section
    if (finalY + summaryHeight > pageHeight) {
        doc.addPage();
        finalY = margin; // Reset Y position for the new page
    }

    doc.setFontSize(12);
    doc.text('Summary', margin, finalY + 15);
    
    let summaryY = finalY + 23;
    
    const addLine = (label: string, value: string, options: { isBold?: boolean; size?: number; color?: number[], isSubline?: boolean } = {}) => {
        const { isBold = false, size = 12, color = [0, 0, 0], isSubline = false } = options;
        
        doc.setFontSize(size);
        doc.setTextColor(color[0], color[1], color[2]);
        if (isBold) doc.setFont(undefined, 'bold');
        
        doc.text(label, isSubline ? margin + 4 : margin, summaryY);
        if (value) {
           doc.text(value, rightAlignX, summaryY, { align: 'right' });
        }
        
        if (isBold) doc.setFont(undefined, 'normal');
        
        // Reset to default for next line
        doc.setFontSize(12);
        doc.setTextColor(0, 0, 0);

        summaryY += 7; // Increment Y position for the next line
    };

    addLine('Previous Balance:', `₹${previousBalance.toFixed(2)}`);
    addLine('This Month\'s Bill:', `₹${totalAmount.toFixed(2)}`);
    addLine(`(Total Quantity: ${totalQuantity.toFixed(2)} L @ ₹${customer.milkPrice.toFixed(2)}/L)`, '', { size: 10, color: [100, 100, 100], isSubline: true });
    addLine('Total Amount Due:', `₹${(previousBalance + totalAmount).toFixed(2)}`);
    addLine('Payments Received:', `- ₹${totalPaid.toFixed(2)}`, { color: [0, 128, 0] });
    
    // Divider line
    summaryY += 2;
    doc.setLineWidth(0.5);
    doc.line(margin, summaryY, rightAlignX, summaryY);
    summaryY += 5;

    // Final balance with color coding
    const balanceColor = balance > 0 ? [220, 53, 69] : [40, 167, 69]; // Red for due, green for settled/credit
    addLine('Outstanding Balance:', `₹${balance.toFixed(2)}`, { isBold: true, size: 14, color: balanceColor });
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

  const handleDownloadTemplate = () => {
    if (!billingMonth) {
        alert("Please select a month first.");
        return;
    }

    const [year, month] = billingMonth.split('-').map(Number);
    const daysInMonth = new Date(year, month, 0).getDate();
    const headers = ['Customer Name', ...Array.from({ length: daysInMonth }, (_, i) => String(i + 1))];

    const rows = activeCustomers.map(customer => {
        const row = [customer.name];
        for (let i = 0; i < daysInMonth; i++) {
            row.push(String(customer.defaultQuantity));
        }
        return row.join(',');
    });

    const csvContent = [headers.join(','), ...rows].join('\n');
    downloadCSV(csvContent, `delivery_template_${billingMonth}.csv`);
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !billingMonth) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            // FIX: The `result` of a FileReader can be a string, ArrayBuffer, or null.
            // A type guard is necessary to ensure we have a string before using string methods.
            const text = e.target?.result;
            if (typeof text !== 'string') {
              alert('Error reading file content or file is empty.');
              return;
            }

            const rows = text.split('\n').filter(row => row.trim() !== '');
            if (rows.length < 2) throw new Error("CSV is empty or has only a header.");

            const header = rows[0].split(',').map(h => h.trim());
            const customerNameHeader = header[0];
            if (customerNameHeader.toLowerCase() !== 'customer name') {
                throw new Error("Invalid template. First column must be 'Customer Name'.");
            }
            
            const customerMapByName = new Map(customers.map(c => [c.name.toLowerCase(), c.id]));
            const deliveriesToUpsert: Omit<Delivery, 'id' | 'userId'>[] = [];
            const notFoundCustomers = new Set<string>();
            const [year, monthStr] = billingMonth.split('-');

            for (let i = 1; i < rows.length; i++) {
                const values = rows[i].split(',');
                const customerName = values[0].trim();
                const customerId = customerMapByName.get(customerName.toLowerCase());

                if (!customerId) {
                    notFoundCustomers.add(customerName);
                    continue;
                }

                for (let dayIndex = 1; dayIndex < header.length; dayIndex++) {
                    const day = parseInt(header[dayIndex], 10);
                    const quantityStr = values[dayIndex]?.trim();
                    if (!isNaN(day) && quantityStr) {
                        const quantity = parseFloat(quantityStr);
                        if (!isNaN(quantity) && quantity > 0) {
                            const date = `${year}-${monthStr}-${String(day).padStart(2, '0')}`;
                            deliveriesToUpsert.push({ customerId, date, quantity });
                        }
                    }
                }
            }

            if (deliveriesToUpsert.length === 0) {
                alert("No valid delivery data found to import.");
                return;
            }

            const { data, error } = await supabase
                .from('deliveries')
                .upsert(deliveriesToUpsert, { onConflict: 'customerId,date' })
                .select();
            
            if (error) throw error;
            
            if (data) {
                setDeliveries(prev => {
                    const updatedMap = new Map(prev.map(d => [`${d.customerId}-${d.date}`, d]));
                    (data as Delivery[]).forEach(d => updatedMap.set(`${d.customerId}-${d.date}`, d));
                    return Array.from(updatedMap.values());
                });
            }

            let alertMessage = `${data?.length || 0} delivery records imported/updated for ${billingMonth}.`;
            if (notFoundCustomers.size > 0) {
                alertMessage += `\n\nCould not find the following customers (they were skipped):\n- ${Array.from(notFoundCustomers).join('\n- ')}`;
            }
            alert(alertMessage);
        } catch (error: any) {
             alert(`Error importing file: ${getFriendlyErrorMessage(error)}`);
        } finally {
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
        }
    };
    reader.readAsText(file);
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

        // Fix: Manually merge state changes to ensure immediate UI update
        setDeliveries(prev => {
            const deliveriesAfterDeletion = prev.filter(d => 
                !(d.customerId === selectedCustomerId && datesToDelete.includes(d.date))
            );
            
            const updatedDeliveriesMap = new Map(
                deliveriesAfterDeletion.map(d => [`${d.customerId}-${d.date}`, d])
            );

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
        alert(`Error saving changes: ${getFriendlyErrorMessage(error)}`);
    } finally {
        setIsSaving(false);
    }
  };

  const saveButtonText = isSaving 
    ? 'Saving...' 
    : `Save Changes ${pendingDeliveryChanges.size > 0 ? `(${pendingDeliveryChanges.size})` : ''}`;

  return (
    <div>
      <input type="file" ref={fileInputRef} onChange={handleFileImport} className="hidden" accept=".csv" />
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
                                            <QuantityInput
                                                value={getDisplayQuantityForDate(date)}
                                                onChange={(newValue) => handleDeliveryInputChange(date, newValue)}
                                                placeholder="0"
                                                inputClassName="w-16"
                                                readOnly={isReadOnly}
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
              {selectedCustomerBillDetails.balance > 0 && (
                    <div className="mt-6">
                        <h4 className="text-lg font-semibold text-gray-800 mb-2">Pay with UPI</h4>
                        <div className="flex flex-col items-center bg-gray-50 p-4 rounded-lg border">
                            {isQrLoading && <div className="w-48 h-48 flex items-center justify-center bg-gray-100 rounded-md"><p>Generating QR...</p></div>}
                            {qrCodeDataUrl && !isQrLoading && <img src={qrCodeDataUrl} alt="UPI QR Code for payment" className="w-48 h-48 rounded-md" />}
                            {!qrCodeDataUrl && !isQrLoading && <div className="w-48 h-48 flex items-center justify-center bg-gray-100 rounded-md text-center text-xs text-gray-500"><p>Could not load QR code. Please check your connection.</p></div>}
                            <p className="mt-3 text-sm text-gray-800 font-medium flex items-center">
                                <ScanIcon className="h-4 w-4 mr-2 text-gray-500"/>
                                Scan to pay using any UPI app
                            </p>
                            <p className="font-mono text-sm mt-2 bg-gray-200 px-3 py-1 rounded-full text-gray-700">
                                9959202010@upi
                            </p>
                        </div>
                    </div>
              )}
            </div>
          </div>
           <div className="mt-8 flex flex-wrap justify-center items-center gap-4 print:hidden">
                <button onClick={() => handleSendWhatsApp(selectedCustomerBillDetails)} className="flex items-center px-6 py-2 bg-green-500 text-white rounded-lg shadow-sm hover:bg-green-600 transition-colors"><WhatsAppIcon className="h-5 w-5 mr-2" />Send via WhatsApp</button>
                <button onClick={handleShareBill} className="flex items-center px-6 py-2 bg-gray-600 text-white rounded-lg shadow-sm hover:bg-gray-700 transition-colors"><ShareIcon className="h-5 w-5 mr-2" />Share Bill</button>
                <button onClick={handlePrint} className="flex items-center px-6 py-2 bg-blue-600 text-white rounded-lg shadow-sm hover:bg-blue-700 transition-colors"><PrintIcon className="h-5 w-5 mr-2" />Print Bill</button>
                {!isReadOnly && <button onClick={handleDownloadPdf} className="flex items-center px-6 py-2 bg-red-600 text-white rounded-lg shadow-sm hover:bg-red-700 transition-colors"><DownloadIcon className="h-5 w-5 mr-2" />Download PDF</button>}
            </div>
            {!isReadOnly && pendingDeliveryChanges.size > 0 && (
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
                {!isReadOnly && (
                    <div className="flex items-center gap-2 flex-wrap">
                        <button onClick={handleDownloadTemplate} className="flex items-center px-3 py-2 text-sm text-gray-600 border rounded-lg hover:bg-gray-100 transition-colors"><DownloadIcon className="h-4 w-4 mr-2"/> Download Template</button>
                        <button onClick={handleImportClick} className="flex items-center px-3 py-2 text-sm bg-gray-600 text-white rounded-lg shadow-sm hover:bg-gray-700 transition-colors"><UploadIcon className="h-4 w-4 mr-2"/> Import Month's Deliveries</button>
                        <button onClick={handleExportSummary} className="flex items-center px-3 py-2 text-sm bg-gray-600 text-white rounded-lg shadow-sm hover:bg-gray-700 transition-colors"><DownloadIcon className="h-4 w-4 mr-2"/> Export Summary (CSV)</button>
                        <button onClick={handleDownloadAllPdfs} className="flex items-center px-3 py-2 text-sm bg-red-600 text-white rounded-lg shadow-sm hover:bg-red-700 transition-colors"><DownloadIcon className="h-4 w-4 mr-2"/> Download All Bills (PDF)</button>
                    </div>
                )}
            </div>
            {allBillDetails.length > 0 ? (
                <div>
                    {/* Desktop Table View */}
                    <div className="overflow-x-auto hidden md:block">
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
                                        <td className="px-4 py-2 font-medium text-gray-900">
                                            {details.customer.name}
                                            {details.customer.status === 'inactive' && (
                                                <span className="ml-2 px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-gray-100 text-gray-800">
                                                    Inactive
                                                </span>
                                            )}
                                        </td>
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
                    {/* Mobile Card View */}
                    <div className="space-y-4 md:hidden">
                        {allBillDetails.map(details => (
                             <div key={details.customer.id} className="bg-white border rounded-lg shadow-sm p-4">
                                <h4 className="font-bold text-lg text-gray-800 mb-2 flex items-center">
                                    {details.customer.name}
                                    {details.customer.status === 'inactive' && (
                                        <span className="ml-2 px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-gray-100 text-gray-800">
                                            Inactive
                                        </span>
                                    )}
                                </h4>
                                <div className="text-sm space-y-1 border-t pt-2">
                                    <p className="flex justify-between"><span>Prev. Balance:</span> <span>₹{details.previousBalance.toFixed(2)}</span></p>
                                    <p className="flex justify-between"><span>Current Bill:</span> <span>₹{details.totalAmount.toFixed(2)}</span></p>
                                    <p className="flex justify-between"><span>Paid:</span> <span className="text-green-600">₹{details.totalPaid.toFixed(2)}</span></p>
                                    <p className={`flex justify-between font-bold text-base mt-2 pt-2 border-t ${details.balance > 0 ? 'text-red-600' : 'text-green-600'}`}>
                                        <span>Outstanding:</span> 
                                        <span>₹{details.balance.toFixed(2)}</span>
                                    </p>
                                </div>
                                <div className="flex justify-end gap-2 mt-4 pt-2 border-t">
                                    <button onClick={() => handleSendWhatsApp(details)} aria-label="Send via WhatsApp" className="text-green-500 hover:text-green-700 p-1"><WhatsAppIcon className="h-6 w-6"/></button>
                                    <button onClick={() => setSelectedCustomerId(details.customer.id)} className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700">View/Edit</button>
                                </div>
                            </div>
                        ))}
                    </div>
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