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

export default function DividendsPage({ filterUserId = null }) {
  const [exchanges, setExchanges] = useState([]);
  const [allStocks, setAllStocks] = useState([]);
  const [stocks, setStocks] = useState([]);
  const [selectedExchange, setSelectedExchange] = useState(null);

  const [form, setForm] = useState({
    ticker: '',
    quantity: '',
    amount_per_share: '',
    payment_date: '',
  });
  const [dateValue, setDateValue] = useState(null);

  const [dividends, setDividends] = useState([]);
  const [filteredDividends, setFilteredDividends] = useState([]);

  const [trades, setTrades] = useState([]);
  const [stockBalances, setStockBalances] = useState({});

  const [filterTicker, setFilterTicker] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState(null);
  const [filterDateTo, setFilterDateTo] = useState(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('exchanges')
        .select('exchange_id, name, currency:currencies(symbol)');
      setExchanges(data || []);
    })();
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('stocks')
        .select('stock_id, ticker, exchange_id');
      setAllStocks(data || []);
    })();
  }, []);

  useEffect(() => {
    async function fetchDividends() {
      let q = supabase.from('dividends').select('*').order('payment_date', { ascending: false });
      if (filterUserId) q = q.eq('user_id', filterUserId);
      const { data } = await q;
      setDividends(data || []);
      setFilteredDividends(data || []);
    }
    fetchDividends();
  }, [filterUserId]);

  useEffect(() => {
    async function fetchTrades() {
      let q = supabase.from('trades').select('*');
      if (filterUserId) q = q.eq('user_id', filterUserId);
      const { data } = await q;
      setTrades(data || []);
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
    const filteredStocks = allStocks.filter(s =>
      s.exchange_id === selectedExchange.exchange_id &&
      (stockBalances[s.stock_id] > 0)
    );
    setStocks(filteredStocks);
    setForm(prev => ({ ...prev, ticker: '', quantity: '' }));
  }, [selectedExchange, allStocks, stockBalances]);

  useEffect(() => {
    let filtered = dividends;

    if (filterTicker) {
      filtered = filtered.filter(div => {
        const stock = allStocks.find(s => s.stock_id === div.stock_id);
        return stock && stock.ticker.toLowerCase().includes(filterTicker.toLowerCase());
      });
    }

    if (filterDateFrom) {
      const from = formatDateToYYYYMMDD(filterDateFrom);
      filtered = filtered.filter(div => div.payment_date >= from);
    }

    if (filterDateTo) {
      const to = formatDateToYYYYMMDD(filterDateTo);
      filtered = filtered.filter(div => div.payment_date <= to);
    }

    setFilteredDividends(filtered);
  }, [filterTicker, filterDateFrom, filterDateTo, dividends, allStocks]);

  const handleChange = e => {
    const { name, value } = e.target;

    if (name === 'quantity' && form.ticker) {
      const stock = stocks.find(s => s.ticker === form.ticker);
      if (stock) {
        const maxQuantity = stockBalances[stock.stock_id] || 0;
        let val = parseInt(value, 10);
        if (isNaN(val)) {
          setForm(prev => ({ ...prev, [name]: '' }));
          return;
        }
        if (val > maxQuantity) val = maxQuantity;
        if (val < 0) val = 0;
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

    const quantity = parseInt(form.quantity, 10);
    const amount_per_share = parseFloat(form.amount_per_share);
    if (isNaN(quantity) || isNaN(amount_per_share) || quantity <= 0) {
      return alert('Введите корректные число количества и суммы на акцию');
    }

    const maxQuantity = stockBalances[stock.stock_id] || 0;
    if (quantity > maxQuantity) return alert(`Максимальное количество: ${maxQuantity}`);

    if (!form.payment_date) return alert('Выберите дату выплаты');

    const total_amount = quantity * amount_per_share;

    const { data, error } = await supabase
      .from('dividends')
      .insert([{
        stock_id: stock.stock_id,
        payment_date: form.payment_date,
        quantity,
        amount_per_share,
        total_amount,
      }])
      .select();

    if (error) return alert('Ошибка при добавлении дивиденда: ' + error.message);
    if (!data || data.length === 0) return alert('Не удалось получить данные добавленного дивиденда');

    setDividends(prev => [data[0], ...prev]);
    setForm({ ticker: '', quantity: '', amount_per_share: '', payment_date: '' });
    setDateValue(null);
  };

  const handleDelete = async id => {
    if (!window.confirm('Удалить этот дивиденд?')) return;
    const { error } = await supabase.from('dividends').delete().eq('dividend_id', id);
    if (error) return alert('Ошибка при удалении: ' + error.message);
    setDividends(prev => prev.filter(d => d.dividend_id !== id));
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
          label="Количество"
          name="quantity"
          value={form.quantity}
          onChange={handleChange}
          type="number"
          required
          sx={{ width: 120 }}
          inputProps={{
            min: 1,
            max: form.ticker ? (stockBalances[stocks.find(s => s.ticker === form.ticker)?.stock_id] || 0) : undefined,
          }}
          helperText={
            form.ticker
              ? `Максимум: ${stockBalances[stocks.find(s => s.ticker === form.ticker)?.stock_id] || 0}`
              : ''
          }
        />

        <TextField
          label="Сумма на акцию"
          name="amount_per_share"
          value={form.amount_per_share}
          onChange={e => setForm(prev => ({ ...prev, amount_per_share: e.target.value }))}
          type="number"
          inputProps={{ step: "0.0001" }}
          required
          sx={{ width: 160 }}
        />

        <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={ruLocale}>
          <DatePicker
            label="Дата выплаты"
            value={dateValue}
            onChange={(newValue) => {
              setDateValue(newValue);
              setForm(prev => ({ ...prev, payment_date: formatDateToYYYYMMDD(newValue) }));
            }}
            renderInput={(params) => (
              <TextField {...params} required sx={{ width: 160 }} />
            )}
          />
        </LocalizationProvider>

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
            <TableCell align="right">Кол-во</TableCell>
            <TableCell align="right">Сумма/акц</TableCell>
            <TableCell align="right">Итого</TableCell>
            <TableCell align="center">Действия</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {filteredDividends.map(d => {
            const stock = allStocks.find(s => s.stock_id === d.stock_id);
            return (
              <TableRow key={d.dividend_id}>
                <TableCell>{d.payment_date}</TableCell>
                <TableCell>{stock?.ticker || d.stock_id}</TableCell>
                <TableCell align="right">{d.quantity}</TableCell>
                <TableCell align="right">{d.amount_per_share}</TableCell>
                <TableCell align="right">{d.total_amount}</TableCell>
                <TableCell align="center">
                  <IconButton size="small" color="error" onClick={() => handleDelete(d.dividend_id)}>
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
