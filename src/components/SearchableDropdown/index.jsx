import { useState, useRef, useEffect } from 'react';
import styles from './SearchableDropdown.module.css';

export const SearchableDropdown = ({ options = [], value, onChange, placeholder }) => {
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

    // Ensure options is always an array
    const safeOptions = Array.isArray(options) ? options : [];

    const filteredOptions = safeOptions.filter(option =>
        option && typeof option === 'string' && option.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className={styles.searchableDropdown} ref={dropdownRef}>
            <div
                className={styles.dropdownHeader}
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
                    className={styles.dropdownInput}
                />
                <span className={styles.dropdownArrow}>▼</span>
            </div>
            {isOpen && (
                <div className={styles.dropdownOptions}>
                    <div
                        className={styles.dropdownOption}
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
                            className={styles.dropdownOption}
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
