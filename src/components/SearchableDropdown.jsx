import React, { useState, useRef, useEffect } from 'react';

const SearchableDropdown = ({ options, value, onChange, placeholder }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const dropdownRef = useRef(null);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const filteredOptions = options.filter(option =>
        option.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="searchable-dropdown" ref={dropdownRef}>
            <div 
                className="dropdown-header" 
                onClick={() => setIsOpen(!isOpen)}
            >
                <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => {
                        setSearchTerm(e.target.value);
                        setIsOpen(true);
                    }}
                    placeholder={value === "all" ? placeholder : value}
                    className="dropdown-input"
                />
                <span className="dropdown-arrow">▼</span>
            </div>
            {isOpen && (
                <div className="dropdown-options">
                    <div
                        className="dropdown-option"
                        onClick={() => {
                            onChange({ target: { value: "all" } });
                            setSearchTerm('');
                            setIsOpen(false);
                        }}
                    >
                        {placeholder}
                    </div>
                    {filteredOptions.map((option, index) => (
                        <div
                            key={index}
                            className="dropdown-option"
                            onClick={() => {
                                onChange({ target: { value: option } });
                                setSearchTerm('');
                                setIsOpen(false);
                            }}
                        >
                            {option}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default SearchableDropdown; 