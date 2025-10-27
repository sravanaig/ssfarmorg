import React, { useState, useMemo } from 'react';
import type { Customer, Delivery } from '../types';
import Modal from './Modal';

interface CalendarViewProps {
  customers: Customer[];
  deliveries: Delivery[];
}

interface DayDetails {
    totalQuantity: number;
    deliveries: { customerName: string; quantity: number }[];
}

const CalendarView: React.FC<CalendarViewProps> = ({ customers, deliveries }) => {
    const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().substring(0, 7)); // YYYY-MM
    const [selectedDayDetails, setSelectedDayDetails] = useState<DayDetails | null>(null);
    const [selectedDate, setSelectedDate] = useState<string | null>(null);

    const customerMap = useMemo(() => new Map(customers.map(c => [c.id, c.name])), [customers]);

    const deliveriesByDate = useMemo(() => {
        const map = new Map<string, DayDetails>();
        deliveries.forEach(delivery => {
            if (!delivery.date.startsWith(selectedMonth)) return;

            const dayDetails = map.get(delivery.date) || { totalQuantity: 0, deliveries: [] };
            
            dayDetails.totalQuantity += delivery.quantity;
            dayDetails.deliveries.push({
                customerName: customerMap.get(delivery.customerId) || 'Unknown Customer',
                quantity: delivery.quantity
            });

            map.set(delivery.date, dayDetails);
        });
        // Sort deliveries within each day
        map.forEach(details => {
            details.deliveries.sort((a, b) => a.customerName.localeCompare(b.customerName));
        });
        return map;
    }, [selectedMonth, deliveries, customerMap]);

    const { datesOfMonth, monthStartDay } = useMemo(() => {
        if (!selectedMonth) return { datesOfMonth: [], monthStartDay: 0 };
        const [year, month] = selectedMonth.split('-').map(Number);
        const daysInMonth = new Date(year, month, 0).getDate();
        const monthStartDay = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
        const dates = Array.from({ length: daysInMonth }, (_, i) => `${year}-${String(month).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`);
        return { datesOfMonth: dates, monthStartDay };
    }, [selectedMonth]);
    
    const handleDayClick = (date: string) => {
        const details = deliveriesByDate.get(date);
        if (details && details.deliveries.length > 0) {
            setSelectedDayDetails(details);
            setSelectedDate(date);
        }
    };
    
    const handleCloseModal = () => {
        setSelectedDayDetails(null);
        setSelectedDate(null);
    };

    return (
        <div>
            <div className="flex flex-col md:flex-row justify-between md:items-center mb-6 gap-4">
                <h2 className="text-3xl font-bold text-gray-800">Delivery Calendar</h2>
                <div className="flex items-center gap-2">
                    <label htmlFor="calendar-month" className="text-sm font-medium text-gray-700">Month:</label>
                    <input
                        id="calendar-month"
                        type="month"
                        value={selectedMonth}
                        onChange={e => setSelectedMonth(e.target.value)}
                        className="border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    />
                </div>
            </div>

            <div className="bg-white shadow-md rounded-lg p-4">
                <div className="grid grid-cols-7 gap-1 text-center font-semibold text-xs text-gray-500 mb-2">
                    <div>Sun</div><div>Mon</div><div>Tue</div><div>Wed</div><div>Thu</div><div>Fri</div><div>Sat</div>
                </div>
                <div className="grid grid-cols-7 gap-2">
                    {Array.from({ length: monthStartDay }).map((_, i) => <div key={`empty-${i}`} />)}
                    {datesOfMonth.map(date => {
                        const day = new Date(date + 'T00:00:00Z').getUTCDate();
                        const details = deliveriesByDate.get(date);
                        const hasDeliveries = details && details.totalQuantity > 0;
                        return (
                            <button
                                key={date}
                                onClick={() => handleDayClick(date)}
                                className={`p-2 border rounded-md h-28 flex flex-col items-start text-left ${hasDeliveries ? 'bg-blue-50 hover:bg-blue-100 cursor-pointer' : 'bg-gray-50'} transition-colors`}
                                disabled={!hasDeliveries}
                                aria-label={`View deliveries for ${date}`}
                            >
                                <div className="font-bold text-gray-800">{day}</div>
                                {hasDeliveries && (
                                    <div className="mt-auto w-full">
                                        <span className="text-base font-bold text-blue-700 block">{details.totalQuantity.toFixed(2)} L</span>
                                        <span className="text-xs text-gray-500 block">{details.deliveries.length} Deliveries</span>
                                    </div>
                                )}
                            </button>
                        );
                    })}
                </div>
            </div>

            <Modal isOpen={!!selectedDayDetails} onClose={handleCloseModal} title={`Deliveries for ${selectedDate ? new Date(selectedDate + 'T00:00:00Z').toLocaleDateString('en-CA', { timeZone: 'UTC' }) : ''}`}>
                {selectedDayDetails && (
                    <div>
                        <div className="mb-4 pb-2 border-b">
                            <h4 className="text-lg font-semibold text-gray-800">Total: {selectedDayDetails.totalQuantity.toFixed(2)} Liters</h4>
                        </div>
                        <ul className="space-y-2 max-h-96 overflow-y-auto">
                            {selectedDayDetails.deliveries.map((d, index) => (
                                <li key={index} className="flex justify-between items-center p-2 bg-gray-50 rounded-md">
                                    <span className="text-gray-800">{d.customerName}</span>
                                    <span className="font-semibold text-gray-900">{d.quantity.toFixed(2)} L</span>
                                </li>

                            ))}
                        </ul>
                    </div>
                )}
            </Modal>
        </div>
    );
};

export default CalendarView;
