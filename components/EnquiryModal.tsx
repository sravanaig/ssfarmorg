import React, { useState } from 'react';
import Modal from './Modal';
import { WhatsAppIcon, SpinnerIcon } from './Icons';

interface EnquiryModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const EnquiryModal: React.FC<EnquiryModalProps> = ({ isOpen, onClose }) => {
    const [name, setName] = useState('');
    const [mobile, setMobile] = useState('');
    const [location, setLocation] = useState('');
    const [products, setProducts] = useState({
        buffalo: false,
        cow: false,
        paneer: false,
    });
    const [quantities, setQuantities] = useState({
        buffalo: '1',
        cow: '1',
        paneer: '0.5',
    });
    const [errors, setErrors] = useState<{ [key: string]: string }>({});
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleProductChange = (product: keyof typeof products) => {
        setProducts(prev => ({ ...prev, [product]: !prev[product] }));
    };

    const validate = () => {
        const newErrors: { [key: string]: string } = {};
        if (!name.trim()) newErrors.name = "Name is required.";
        if (!/^\d{10}$/.test(mobile.trim())) newErrors.mobile = "Please enter a valid 10-digit mobile number.";
        if (!location.trim()) newErrors.location = "Location is required.";
        
        const selectedProducts = Object.keys(products).filter(p => products[p as keyof typeof products]);
        if (selectedProducts.length === 0) {
            newErrors.products = "Please select at least one product.";
        } else {
            selectedProducts.forEach(p => {
                const qty = parseFloat(quantities[p as keyof typeof quantities]);
                if (isNaN(qty) || qty <= 0) {
                    newErrors[`quantity_${p}`] = "Quantity must be a positive number.";
                }
            });
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!validate()) return;

        setIsSubmitting(true);

        const selectedProductsList = Object.entries(products)
            .filter(([, isSelected]) => isSelected)
            .map(([productKey]) => {
                const key = productKey as keyof typeof products;
                const productName = productKey.charAt(0).toUpperCase() + productKey.slice(1);
                const quantity = quantities[key];
                const unit = key === 'paneer' ? 'Kg' : 'L';
                return `- ${productName} Milk: ${quantity} ${unit}`;
            })
            .join('\n');
        
        const message = `
New Enquiry from Website:
-----------------------------------
Name: *${name.trim()}*
Mobile: *${mobile.trim()}*
Location: *${location.trim()}*
-----------------------------------
Interested in:
${selectedProductsList}
        `.trim().replace(/^\s+/gm, '');

        const phoneNumber = '917382601453';
        const whatsappUrl = `https://wa.me/${phoneNumber}?text=${encodeURIComponent(message)}`;

        setTimeout(() => {
            window.open(whatsappUrl, '_blank');
            setIsSubmitting(false);
            onClose();
            // Reset form
            setName('');
            setMobile('');
            setLocation('');
            setProducts({ buffalo: false, cow: false, paneer: false });
        }, 500);
    };

    const productOptions: { key: keyof typeof products; label: string; unit: string }[] = [
        { key: 'buffalo', label: 'Buffalo Milk', unit: 'L' },
        { key: 'cow', label: 'Cow Milk', unit: 'L' },
        { key: 'paneer', label: 'Paneer', unit: 'Kg' },
    ];

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Send an Enquiry">
            <form onSubmit={handleSubmit} className="space-y-4">
                <p className="text-sm text-gray-600 mb-4">Fill out the form below and we'll get back to you shortly!</p>
                <div>
                    <label className="block text-sm font-medium text-gray-700">Name</label>
                    <input type="text" value={name} onChange={e => setName(e.target.value)} required className={`mt-1 block w-full border ${errors.name ? 'border-red-500' : 'border-gray-300'} rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm`} />
                    {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name}</p>}
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700">Mobile Number</label>
                     <div className="mt-1 flex">
                        <span className="inline-flex items-center px-3 rounded-l-md border border-r-0 border-gray-300 bg-gray-50 text-gray-500 text-sm">+91</span>
                        <input type="tel" value={mobile} onChange={e => setMobile(e.target.value)} className={`flex-1 min-w-0 block w-full px-3 py-2 rounded-none rounded-r-md border ${errors.mobile ? 'border-red-500' : 'border-gray-300'}`} />
                    </div>
                    {errors.mobile && <p className="mt-1 text-xs text-red-600">{errors.mobile}</p>}
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700">Location / Address</label>
                    <input type="text" value={location} onChange={e => setLocation(e.target.value)} required className={`mt-1 block w-full border ${errors.location ? 'border-red-500' : 'border-gray-300'} rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm`} />
                    {errors.location && <p className="mt-1 text-xs text-red-600">{errors.location}</p>}
                </div>
                
                <div>
                    <label className="block text-sm font-medium text-gray-700">I'm interested in:</label>
                    {errors.products && <p className="mt-1 text-xs text-red-600">{errors.products}</p>}
                    <div className="mt-2 space-y-3">
                        {productOptions.map(({ key, label, unit }) => (
                             <div key={String(key)} className="flex items-center gap-4 p-2 rounded-md border border-gray-200">
                                <div className="flex items-center flex-shrink-0">
                                    <input
                                        id={String(key)}
                                        type="checkbox"
                                        checked={products[key]}
                                        onChange={() => handleProductChange(key)}
                                        className="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                    />
                                    <label htmlFor={String(key)} className="ml-2 block text-sm font-medium text-gray-800">{label}</label>
                                </div>
                                {products[key] && (
                                    <div className="flex items-center gap-2 flex-grow">
                                        <label htmlFor={`quantity_${String(key)}`} className="text-sm text-gray-600">Qty ({unit}):</label>
                                        <input
                                            id={`quantity_${String(key)}`}
                                            type="number"
                                            step={key === 'paneer' ? "0.25" : "0.5"}
                                            min="0"
                                            value={quantities[key]}
                                            onChange={e => setQuantities(prev => ({ ...prev, [key]: e.target.value }))}
                                            className={`block w-full border ${errors[`quantity_${String(key)}`] ? 'border-red-500' : 'border-gray-300'} rounded-md shadow-sm py-1 px-2 text-sm`}
                                        />
                                    </div>
                                )}
                             </div>
                        ))}
                    </div>
                </div>

                <div className="flex justify-end pt-4 space-x-2 border-t">
                    <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300">Cancel</button>
                    <button type="submit" disabled={isSubmitting} className="flex items-center px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50">
                        {isSubmitting ? <SpinnerIcon className="animate-spin h-5 w-5 mr-2" /> : <WhatsAppIcon className="h-5 w-5 mr-2" />}
                        {isSubmitting ? 'Sending...' : 'Send Enquiry'}
                    </button>
                </div>
            </form>
        </Modal>
    );
};

export default EnquiryModal;