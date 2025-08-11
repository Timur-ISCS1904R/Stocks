import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import {
  Box, TextField, Button, Select, MenuItem, InputLabel, FormControl, Table,
  TableBody, TableCell, TableHead, TableRow, IconButton
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';

function formatCurrency(value, symbol) {
  return (
    new Intl.NumberFormat('ru-RU', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
      useGrouping: true,
    }).format(value) + ' ' + symbol
  );
}

export default function DividendsPage() {
  const [exchanges, setExchanges] = useState([]);
  const [allStocks, setAllStocks] = useState([]);
  const [stocks, setStocks] = useState([]);
  const [selectedExchange, setSelectedExchange] = useState(null);
  const [form, setForm] = useState({
    ticker: '',
    payment_date: '',
    quantity: '',
    amount_per_share: '',
  });
  const [dividends, setDividends] = useState([]);

  useEffect(() => {
    async function fetchExchanges() {
      const { data, error } = await supabase
        .from('exchanges')
        .select('exchange_id, name, currency:currencies(code, symbol)');
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
    async function fetchDividends() {
      const { data, error } = await supabase
        .from('dividends')
        .select('*')
        .order('payment_date', { ascending: false });
      if (!error) setDividends(data);
    }
    fetchDividends();
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

    const quantity = parseInt(form.quantity, 10);
    const amount_per_share = parseFloat(form.amount_per_share);
    if (isNaN(quantity) || isNaN(amount_per_share)) {
      alert('Введите корректные число количества и суммы на акцию');
      return;
    }

    const total_amount = quantity * amount_per_share;

    const { data, error } = await supabase
      .from('dividends')
      .insert([{
        stock_id: stock.stock_id,
        payment_date: form.payment_date,
        quantity,
        amount_per_share,
        total_amount
      }])
      .select();

    if (error) {
      alert('Ошибка при добавлении дивиденда: ' + error.message);
      return;
    }

    if (!data || data.length === 0) {
      alert('Не удалось получить данные добавленного дивиденда');
      return;
    }

    setDividends(prev => [data[0], ...prev]);
    setForm({ ticker: '', payment_date: '', quantity: '', amount_per_share: '' });
  };

  const handleDelete = async id => {
    if (!window.confirm('Удалить этот дивиденд?')) return;
    const { error } = await supabase.from('dividends').delete().eq('dividend_id', id);
    if (error) {
      alert('Ошибка при удалении: ' + error.message);
      return;
    }
    setDividends(prev => prev.filter(d => d.dividend_id !== id));
  };

  return (
    <Box>
      <form onSubmit={handleSubmit} style={{ marginBottom: 20 }}>
        <FormControl sx={{ mr: 2, minWidth: 150 }}>
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

        <FormControl sx={{ mr: 2, minWidth: 150 }}>
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
          label="Дата выплаты"
          name="payment_date"
          value={form.payment_date}
          onChange={handleChange}
          type="date"
          required
          sx={{ mr: 2, width: 160 }}
        />

        <TextField
          label="Количество акций"
          name="quantity"
          value={form.quantity}
          onChange={handleChange}
          type="number"
          required
          sx={{ mr: 2, width: 130 }}
        />

        <TextField
          label="Сумма на акцию"
          name="amount_per_share"
          value={form.amount_per_share}
          onChange={handleChange}
          type="number"
          inputProps={{ step: "0.0001" }}
          required
          sx={{ mr: 2, width: 130 }}
        />

        <Button variant="contained" type="submit" sx={{ mt: 1 }}>
          Добавить
        </Button>
      </form>

      <Table>
        <TableHead>
          <TableRow>
            <TableCell>Дата выплаты</TableCell>
            <TableCell>Тикер</TableCell>
            <TableCell>Количество</TableCell>
            <TableCell>Сумма на акцию</TableCell>
            <TableCell>Итого</TableCell>
            <TableCell>Действия</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {dividends.map(dividend => {
            const stock = allStocks.find(s => s.stock_id === dividend.stock_id);
            const ticker = stock ? stock.ticker : '—';
            const exchange = exchanges.find(ex => ex.exchange_id === stock?.exchange_id);
            const currencySymbol = exchange?.currency?.symbol || '';
            return (
              <TableRow key={dividend.dividend_id}>
                <TableCell>{dividend.payment_date}</TableCell>
                <TableCell>{ticker}</TableCell>
                <TableCell>{dividend.quantity}</TableCell>
                <TableCell>{formatCurrency(dividend.amount_per_share, currencySymbol)}</TableCell>
                <TableCell>{formatCurrency(dividend.total_amount, currencySymbol)}</TableCell>
                <TableCell>
                  <IconButton onClick={() => handleDelete(dividend.dividend_id)} size="small" color="error">
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
