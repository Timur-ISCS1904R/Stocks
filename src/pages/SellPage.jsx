import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

import {
  Box, TextField, Button, Select, MenuItem, InputLabel, FormControl, Table,
  TableBody, TableCell, TableHead, TableRow, IconButton, Stack
} from '@mui/material';

import DeleteIcon from '@mui/icons-material/Delete';

import { LocalizationProvider, DatePicker } from '@mui/x-date-pickers';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import ruLocale from 'date-fns/locale/ru';

const formatDateToYYYYMMDD = (date) => {
  if (!date) return '';
  const y = date.getFullYear();
  const m = (date.getMonth() + 1).toString().padStart(2, '0');
  const d = date.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${d}`;
};

export default function SellPage({ filterUserId = null }) {
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

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('exchanges').select('exchange_id, name, currency:currencies(symbol)');
      setExchanges(data || []);
    })();
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('stocks').select('stock_id, ticker, exchange_id');
      setAllStocks(data || []);
    })();
  }, []);

  useEffect(() => {
    async function fetchTrades() {
      let q = supabase.from('trades').select('*').order('trade_date', { ascending: false });
      if (filterUserId) q = q.eq('user_id', filterUserId);
      const { data } = await q;
      setTrades(data || []);
      setFilteredTrades((data || []).filter(t => t.trade_type === 'SELL'));
      calculateBalances(data || []);
    }
    fetchTrades();
  }, [filterUserId]);

  function calculateBalances(tradesData) {
    const balances = {};
    tradesData.forEach(trade => {
      if (!balances[trade.stock_id]) balances[trade.stock_id] = 0;
      if (trade.trade_type === 'BUY') balances[trade.stock_id] += trade.quantity;
      else if (trade.trade_type === 'SELL') balances[trade.stock_id] -= trade.quantity;
    });
    setStockBalances(balances);
  }

  useEffect(() => {
    if (!selectedExchange) {
      setStocks([]);
      setForm(prev => ({ ...prev, ticker: '' }));
      return;
    }
    const filtered = allStocks.filter(s =>
      s.exchange_id === selectedExchange.exchange_id &&
      (stockBalances[s.stock_id] > 0)
    );
    setStocks(filtered);
    setForm(prev => ({ ...prev, ticker: '' }));
  }, [selectedExchange, allStocks, stockBalances]);

  useEffect(() => {
    let filtered = trades.filter(t => t.trade_type === 'SELL');
    if (filterTicker) {
      filtered = filtered.filter(trade => {
        const stock = allStocks.find(s => s.stock_id === trade.stock_id);
        return stock && stock.ticker.toLowerCase().includes(filterTicker.toLowerCase());
      });
    }
    if (filterDateFrom) {
      const from = formatDateToYYYYMMDD(filterDateFrom);
      filtered = filtered.filter(trade => trade.trade_date >= from);
    }
    if (filterDateTo) {
      const to = formatDateToYYYYMMDD(filterDateTo);
      filtered = filtered.filter(trade => trade.trade_date <= to);
    }
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
    calculateBalances(newTrades);
    setForm({ ticker: '', price: '', date: '', quantity: '' });
    setDateValue(null);
  };

  const handleDelete = async id => {
    if (!window.confirm('Удалить эту сделку?')) return;
    const { error } = await supabase.from('trades').delete().eq('trade_id', id);
    if (error) return alert('Ошибка при удалении: ' + error.message);
    const newTrades = trades.filter(t => t.trade_id !== id);
    setTrades(newTrades);
    calculateBalances(newTrades);
  };

  return (
    <Box>
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
          inputProps={{
            min: 1,
            max: form.ticker ? (stockBalances[stocks.find(s => s.ticker === form.ticker)?.stock_id] || 0) : undefined
          }}
          sx={{ width: 120 }}
          helperText={
            form.ticker
              ? `Максимум: ${stockBalances[stocks.find(s => s.ticker === form.ticker)?.stock_id] || 0}`
              : ''
          }
        />

        <Button variant="contained" type="submit" sx={{ alignSelf: 'center' }}>Добавить</Button>
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

      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Дата</TableCell>
            <TableCell>Тикер</TableCell>
            <TableCell align="right">Цена</TableCell>
            <TableCell align="right">Кол-во</TableCell>
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
                <TableCell>{stock?.ticker || trade.stock_id}</TableCell>
                <TableCell align="right">{trade.price_per_share}</TableCell>
                <TableCell align="right">{trade.quantity}</TableCell>
                <TableCell align="right">{trade.total_amount}</TableCell>
                <TableCell align="center">
                  <IconButton size="small" color="error" onClick={() => handleDelete(trade.trade_id)}>
                    <DeleteIcon fontSize="small" />
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
