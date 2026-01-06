"use client";

import React, { FC } from 'react';
import { DateRange } from 'react-date-range';
// context
import { DATA_ACTION_TYPES } from '@/context/DataContext';
import { useDataContext } from '@/hooks/useDataContext';

const AppDateRange: FC = () => {
  const [{ checkIn, checkOut }, dispatch] = useDataContext();

  const selectionRange = {
    startDate: checkIn || new Date(),
    endDate: checkOut || new Date(),
    key: 'selection',
  };

  const handleSelect = (ranges: any) => {
    const { selection } = ranges;
    dispatch({ type: DATA_ACTION_TYPES.SET_CHECK_IN, payload: selection.startDate });
    dispatch({ type: DATA_ACTION_TYPES.SET_CHECK_OUT, payload: selection.endDate });
  };

  return (
    <div className="md:py-4 rounded-3xl">
      <DateRange
        ranges={[selectionRange]}
        onChange={handleSelect}
        rangeColors={['#FD5B61']}
        minDate={new Date()}
        direction="horizontal"
        moveRangeOnFirstSelection={false}
      />
    </div>
  );
};

export default AppDateRange;
