import React from 'react';

interface QuantityInputProps {
  value: number | string;
  onChange: (newValue: string) => void;
  step?: number;
  placeholder?: string;
  id?: string;
  inputClassName?: string;
  readOnly?: boolean;
}

const QuantityInput: React.FC<QuantityInputProps> = ({ value, onChange, step = 0.5, placeholder, id, inputClassName = 'w-16', readOnly = false }) => {
  const handleIncrement = () => {
    if (readOnly) return;
    const currentValue = parseFloat(String(value)) || 0;
    const newValue = currentValue + step;
    onChange(String(newValue));
  };

  const handleDecrement = () => {
    if (readOnly) return;
    const currentValue = parseFloat(String(value)) || 0;
    const newValue = Math.max(0, currentValue - step);
    onChange(String(newValue));
  };
  
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (readOnly) return;
    const newValue = e.target.value;
    if (newValue === '' || /^[0-9]*\.?[0-9]*$/.test(newValue)) {
      onChange(newValue);
    }
  };

  return (
    <div className="inline-flex items-center">
      <button
        type="button"
        onClick={handleDecrement}
        disabled={readOnly}
        className="px-3 h-8 text-lg font-semibold border border-gray-300 rounded-l-md bg-gray-50 hover:bg-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
        aria-label="Decrement quantity"
      >
        -
      </button>
      <input
        id={id}
        type="text"
        inputMode="decimal"
        value={value}
        onChange={handleChange}
        placeholder={placeholder}
        readOnly={readOnly}
        className={`${inputClassName} border-t border-b border-gray-300 h-8 text-center py-1 focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-sm disabled:bg-gray-100`}
      />
      <button
        type="button"
        onClick={handleIncrement}
        disabled={readOnly}
        className="px-3 h-8 text-lg font-semibold border border-gray-300 rounded-r-md bg-gray-50 hover:bg-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
        aria-label="Increment quantity"
      >
        +
      </button>
    </div>
  );
};

export default QuantityInput;
