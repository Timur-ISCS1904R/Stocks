import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

import {
  Box, TextField, Button, Select, MenuItem, InputLabel, FormControl, Table,
  TableBody, TableCell, TableHead, TableRow, IconButton, Stack,
  Grid, TableContainer, Paper
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

const formatDateToYYYYMMDD = (date) => {
  if (!date) return '';
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export default function SellPage({ filterUserId = null, readOnly = false }) {
  const [exchanges, setExchanges] = useState([]);
  const [allStocks, setAllStocks] = useState([]);
  const [stocks, setStocks] = useState([]);
  const [selectedExchange, setSelectedExchange] = useState(null);

  const [form, setForm] = useState({ ticker: '', price: '', date: '', quantity: '' });
  const [dateValue, setDateValue] = useState(null);

  const [trades, setTrades] = useState([]);
  const [filteredTrades, setFilteredTrades] = useState([]);

  const [stockBalances, setStockBalances] = useState({});

  const [filterTicker, setFilterTicker] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState(null);
  const [filterDateTo, setFilterDateTo] = useState(null);

  const [currency, setCurrency] = useState('₸');

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.from('exchanges').select('exchange_id, name, currency:currencies(symbol)');
      if (!error) setExchanges(data || []);
    })();
  }, []);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.from('stocks').select('stock_id, ticker, exchange_id');
      if (!error) setAllStocks(data || []);
    })();
  }, []);

  useEffect(() => {
    async function fetchTrades() {
      let q = supabase.from('trades').select('*').order('trade_date', { ascending: false });
      if (filterUserId) q = q.eq('user_id', filterUserId);
      const { data, error } = await q;
      if (!error) {
        setTrades(data || []);
        setFilteredTrades((data || []).filter(t => t.trade_type === 'SELL'));

        // баланс
        const balances = {};
        (data || []).forEach(trade => {
          if (!balances[trade.stock_id]) balances[trade.stock_id] = 0;
          if (trade.trade_type === 'BUY') balances[trade.stock_id] += trade.quantity;
          else if (trade.trade_type === 'SELL') balances[trade.stock_id] -= trade.quantity;
        });
        setStockBalances(balances);
      }
    }
    fetchTrades();
  }, [filterUserId]);

  useEffect(() => {
    if (!selectedExchange) {
      setStocks([]);
      setForm(prev => ({ ...prev, ticker: '' }));
      return;
    }
    setStocks(allStocks.filter(s =>
      s.exchange_id === selectedExchange.exchange_id &&
      (stockBalances[s.stock_id] > 0)
    ));
    setCurrency(selectedExchange?.currency?.symbol || '₸');
  }, [selectedExchange, allStocks, stockBalances]);

  useEffect(() => {
    let filtered = trades.filter(t => t.trade_type === 'SELL');

    if (filterTicker) {
      filtered = filtered.filter(trade => {
        const stock = allStocks.find(s => s.stock_id === trade.stock_id);
        return stock && stock.ticker.toLowerCase().includes(filterTicker.toLowerCase());
      });
    }

    const from = filterDateFrom ? formatDateToYYYYMMDD(filterDateFrom) : null;
    const to = filterDateTo ? formatDateToYYYYMMDD(filterDateTo) : null;

    if (from) filtered = filtered.filter(trade => trade.trade_date >= from);
    if (to) filtered = filtered.filter(trade => trade.trade_date <= to);

    setFilteredTrades(filtered);
  }, [filterTicker, filterDateFrom, filterDateTo, trades, allStocks]);

  const handleChange = e => {
    const { name, value } = e.target;
    if (name === 'quantity' && form.ticker) {
      const stock = stocks.find(s => s.ticker === form.ticker);
      if (stock) {
        const max = stockBalances[stock.stock_id] || 0;
        let val = parseInt(value, 10);
        if (isNaN(val)) val = '';
        else if (val > max) val = max;
        setForm(prev => ({ ...prev, [name]: val }));
        return;
      }
    }
    setForm(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async e => {
    e.preventDefault();

    const stock = stocks.find(s => s.ticker === form.ticker);
    if (!stock) return alert('Выберите корректный тикер');

    const price = parseFloat(form.price);
    const quantity = parseInt(form.quantity, 10);
    if (isNaN(price) || isNaN(quantity) || quantity <= 0) return alert('Введите корректные число цены и количества');

    const max = stockBalances[stock.stock_id] || 0;
    if (quantity > max) return alert(`Максимальное количество для продажи: ${max}`);
    if (!form.date) return alert('Выберите дату сделки');

    const total_amount = price * quantity;

    const { data, error } = await supabase
      .from('trades')
      .insert([{
        stock_id: stock.stock_id,
        trade_date: form.date,
        trade_type: 'SELL',
        price_per_share: price,
        quantity,
        total_amount
      }])
      .select();

    if (error) return alert('Ошибка при добавлении сделки: ' + error.message);
    if (!data || data.length === 0) return alert('Не удалось получить данные добавленной сделки');

    const newTrades = [data[0], ...trades];
    setTrades(newTrades);

    const balances = {};
    newTrades.forEach(trade => {
      if (!balances[trade.stock_id]) balances[trade.stock_id] = 0;
      if (trade.trade_type === 'BUY') balances[trade.stock_id] += trade.quantity;
      else if (trade.trade_type === 'SELL') balances[trade.stock_id] -= trade.quantity;
    });
    setStockBalances(balances);

    setFilteredTrades(newTrades.filter(t => t.trade_type === 'SELL'));
    setForm({ ticker: '', price: '', date: '', quantity: '' });
    setDateValue(null);
  };

  const handleDelete = async id => {
    if (!window.confirm('Удалить эту сделку?')) return;
    const { error } = await supabase.from('trades').delete().eq('trade_id', id);
    if (error) return alert('Ошибка при удалении: ' + error.message);
    const newTrades = trades.filter(t => t.trade_id !== id);
    setTrades(newTrades);

    const balances = {};
    newTrades.forEach(trade => {
      if (!balances[trade.stock_id]) balances[trade.stock_id] = 0;
      if (trade.trade_type === 'BUY') balances[trade.stock_id] += trade.quantity;
      else if (trade.trade_type === 'SELL') balances[trade.stock_id] -= trade.quantity;
    });
    setStockBalances(balances);

    setFilteredTrades(newTrades.filter(t => t.trade_type === 'SELL'));
  };

  return (
    <Box>
      {/* форма как была; кнопка учитывает readOnly */}
      <form
        onSubmit={handleSubmit}
        style={{ marginBottom: 20, display: 'flex', flexWrap: 'wrap', gap: '16px' }}
      >
        <FormControl sx={{ minWidth: 150 }}>
          <InputLabel>Биржа</InputLabel>
          <Select
            value={selectedExchange ? selectedExchange.exchange_id : ''}
            label="Биржа"
            onChange={e => {
              const ex = exchanges.find(x => x.exchange_id === e.target.value);
              setSelectedExchange(ex || null);
              setForm(prev => ({ ...prev, ticker: '', quantity: '' }));
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
            onChange={e => setForm(prev => ({ ...prev, ticker: e.target.value, quantity: '' }))}
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

        <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={ruLocale}>
          <DatePicker
            label="Дата"
            value={dateValue}
            onChange={(newValue) => {
              setDateValue(newValue);
              setForm(prev => ({ ...prev, date: formatDateToYYYYMMDD(newValue) }));
            }}
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

        <Button variant="contained" type="submit" sx={{ alignSelf: 'center' }} disabled={readOnly}>Добавить</Button>
      </form>

      {/* Фильтры */}
      <Box sx={{ mb: 2 }}>
        <Stack direction="row" spacing={2} flexWrap="wrap">
          <TextField
            label="Фильтр по тикеру"
            value={filterTicker}
            onChange={e => setFilterTicker(e.target.value)}
            sx={{ minWidth: 150 }}
          />
          <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={ruLocale}>
            <DatePicker
              label="Дата с"
              value={filterDateFrom}
              onChange={setFilterDateFrom}
              renderInput={(params) => <TextField {...params} sx={{ width: 140 }} />}
            />
            <DatePicker
              label="Дата по"
              value={filterDateTo}
              onChange={setFilterDateTo}
              renderInput={(params) => <TextField {...params} sx={{ width: 140 }} />}
            />
          </LocalizationProvider>
        </Stack>
      </Box>

      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Дата</TableCell>
              <TableCell>Тикер</TableCell>
              <TableCell align="right">Цена</TableCell>
              <TableCell align="right" sx={{ display: { xs: 'none', sm: 'table-cell' } }}>Кол-во</TableCell>
              <TableCell align="right">Сумма</TableCell>
              <TableCell align="center">Действия</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredTrades.map(trade => {
              const stock = allStocks.find(s => s.stock_id === trade.stock_id);
              return (
                <TableRow key={trade.trade_id}>
                  <TableCell>{trade.trade_date}</TableCell>
                  <TableCell>{stock?.ticker || '—'}</TableCell>
                  <TableCell align="right">{formatCurrency(trade.price_per_share, currency)}</TableCell>
                  <TableCell align="right" sx={{ display: { xs: 'none', sm: 'table-cell' } }}>{trade.quantity}</TableCell>
                  <TableCell align="right">{formatCurrency(trade.total_amount, currency)}</TableCell>
                  <TableCell align="center">
                    <IconButton onClick={() => handleDelete(trade.trade_id)} size="small" color="error" disabled={readOnly}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </TableCell>
                </TableRow>
              );
            })}
            {filteredTrades.length === 0 && (
              <TableRow><TableCell colSpan={6}>Нет продаж</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}
