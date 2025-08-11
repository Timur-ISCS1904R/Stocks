import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

import {
  Box, TextField, Button, Select, MenuItem, InputLabel, FormControl, Table,
  TableBody, TableCell, TableHead, TableRow, IconButton
} from '@mui/material';

import DeleteIcon from '@mui/icons-material/Delete';

import { LocalizationProvider, DatePicker } from '@mui/x-date-pickers';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import ruLocale from 'date-fns/locale/ru';

function formatCurrency(value, symbol) {
  return (
    new Intl.NumberFormat('ru-RU', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
      useGrouping: true,
    }).format(value) + ' ' + symbol
  );
}

// Функция для форматирования даты в YYYY-MM-DD без смещения часового пояса
const formatDateToYYYYMMDD = (date) => {
  if (!date) return '';
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0'); // месяцы 0-11
  const day = date.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export default function BuyPage() {
  const [exchanges, setExchanges] = useState([]);
  const [allStocks, setAllStocks] = useState([]);
  const [stocks, setStocks] = useState([]);
  const [selectedExchange, setSelectedExchange] = useState(null);

  // Управляем формой
  const [form, setForm] = useState({
    ticker: '',
    price: '',
    date: '',
    quantity: ''
  });

  // Для MUI DatePicker - локальное значение даты как объект Date
  const [dateValue, setDateValue] = useState(null);

  const [trades, setTrades] = useState([]);

  useEffect(() => {
    async function fetchExchanges() {
      const { data, error } = await supabase
        .from('exchanges')
        .select('exchange_id, name, currency:currencies(symbol)');
      if (!error) setExchanges(data);
    }
    fetchExchanges();
  }, []);

  useEffect(() => {
    async function fetchAllStocks() {
      const { data, error } = await supabase
        .from('stocks')
        .select('stock_id, ticker, exchange_id');
      if (!error) setAllStocks(data);
    }
    fetchAllStocks();
  }, []);

  useEffect(() => {
    if (!selectedExchange) {
      setStocks([]);
      setForm(prev => ({ ...prev, ticker: '' }));
      return;
    }
    setStocks(allStocks.filter(s => s.exchange_id === selectedExchange.exchange_id));
  }, [selectedExchange, allStocks]);

  useEffect(() => {
    async function fetchTrades() {
      const { data, error } = await supabase
        .from('trades')
        .select('*')
        .eq('trade_type', 'BUY')
        .order('trade_date', { ascending: false });
      if (!error) setTrades(data);
    }
    fetchTrades();
  }, []);

  const handleChange = e => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async e => {
    e.preventDefault();

    const stock = stocks.find(s => s.ticker === form.ticker);
    if (!stock) {
      alert('Выберите корректный тикер');
      return;
    }

    const price = parseFloat(form.price);
    const quantity = parseInt(form.quantity, 10);
    if (isNaN(price) || isNaN(quantity)) {
      alert('Введите корректные число цены и количества');
      return;
    }

    if (!form.date) {
      alert('Выберите дату сделки');
      return;
    }

    const total_amount = price * quantity;

    const { data, error } = await supabase
      .from('trades')
      .insert([{
        stock_id: stock.stock_id,
        trade_date: form.date,
        trade_type: 'BUY',
        price_per_share: price,
        quantity,
        total_amount
      }])
      .select();

    if (error) {
      alert('Ошибка при добавлении сделки: ' + error.message);
      return;
    }

    if (!data || data.length === 0) {
      alert('Не удалось получить данные добавленной сделки');
      return;
    }

    setTrades(prev => [data[0], ...prev]);
    setForm({ ticker: '', price: '', date: '', quantity: '' });
    setDateValue(null);
  };

  const handleDelete = async id => {
    if (!window.confirm('Удалить эту сделку?')) return;
    const { error } = await supabase.from('trades').delete().eq('trade_id', id);
    if (error) {
      alert('Ошибка при удалении: ' + error.message);
      return;
    }
    setTrades(prev => prev.filter(t => t.trade_id !== id));
  };

  return (
    <Box>
      <form onSubmit={handleSubmit} style={{ marginBottom: 20, display: 'flex', flexWrap: 'wrap', gap: '16px' }}>
        <FormControl sx={{ minWidth: 150 }}>
          <InputLabel>Биржа</InputLabel>
          <Select
            value={selectedExchange ? selectedExchange.exchange_id : ''}
            label="Биржа"
            onChange={e => {
              const ex = exchanges.find(x => x.exchange_id === e.target.value);
              setSelectedExchange(ex || null);
              setForm(prev => ({ ...prev, ticker: '' }));
            }}
            required
          >
            <MenuItem value=""><em>Выберите</em></MenuItem>
            {exchanges.map(ex => (
              <MenuItem key={ex.exchange_id} value={ex.exchange_id}>{ex.name}</MenuItem>
            ))}
          </Select>
        </FormControl>

        <FormControl sx={{ minWidth: 150 }}>
          <InputLabel>Тикер</InputLabel>
          <Select
            value={form.ticker}
            label="Тикер"
            onChange={handleChange}
            name="ticker"
            required
            disabled={!selectedExchange}
          >
            <MenuItem value=""><em>Выберите</em></MenuItem>
            {stocks.map(stock => (
              <MenuItem key={stock.stock_id} value={stock.ticker}>{stock.ticker}</MenuItem>
            ))}
          </Select>
        </FormControl>

        <TextField
          label="Цена"
          name="price"
          value={form.price}
          onChange={handleChange}
          type="number"
          inputProps={{ step: "0.0001" }}
          required
          sx={{ width: 120 }}
        />

        {/* MUI DatePicker с ручным форматом даты */}
        <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={ruLocale}>
          <DatePicker
            label="Дата"
            value={dateValue}
            onChange={(newValue) => {
              setDateValue(newValue);
              const formattedDate = formatDateToYYYYMMDD(newValue);
              setForm(prev => ({ ...prev, date: formattedDate }));
            }}
            inputFormat="dd/MM/yyyy"
            renderInput={(params) => (
              <TextField {...params} required sx={{ width: 160 }} />
            )}
          />
        </LocalizationProvider>

        <TextField
          label="Количество"
          name="quantity"
          value={form.quantity}
          onChange={handleChange}
          type="number"
          required
          sx={{ width: 120 }}
        />

        <Button variant="contained" type="submit" sx={{ alignSelf: 'center' }}>Добавить</Button>
      </form>

      <Table>
        <TableHead>
          <TableRow>
            <TableCell>Дата</TableCell>
            <TableCell>Тикер</TableCell>
            <TableCell>Цена</TableCell>
            <TableCell>Количество</TableCell>
            <TableCell>Сумма</TableCell>
            <TableCell>Действия</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {trades.map(trade => {
            const stock = allStocks.find(s => s.stock_id === trade.stock_id);
            const ticker = stock ? stock.ticker : '—';
            const exchange = exchanges.find(ex => ex.exchange_id === stock?.exchange_id);
            const currencySymbol = exchange?.currency?.symbol || '';
            return (
              <TableRow key={trade.trade_id}>
                <TableCell>{trade.trade_date}</TableCell>
                <TableCell>{ticker}</TableCell>
                <TableCell>{formatCurrency(trade.price_per_share, currencySymbol)}</TableCell>
                <TableCell>{trade.quantity}</TableCell>
                <TableCell>{formatCurrency(trade.total_amount, currencySymbol)}</TableCell>
                <TableCell>
                  <IconButton onClick={() => handleDelete(trade.trade_id)} size="small" color="error">
                    <DeleteIcon />
                  </IconButton>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </Box>
  );
}
