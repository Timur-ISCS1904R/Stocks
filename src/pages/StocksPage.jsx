import React, { useEffect, useState } from 'react';
import {
  Box, Button, Dialog, DialogActions, DialogContent, DialogTitle,
  TextField, Select, MenuItem, InputLabel, FormControl, Table, TableBody,
  TableCell, TableHead, TableRow, IconButton, Typography
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import { supabase } from '../supabaseClient';

export default function StocksPage() {
  const [stocks, setStocks] = useState([]);
  const [exchanges, setExchanges] = useState([]);
  const [loading, setLoading] = useState(false);

  // Для фильтрации
  const [filterTicker, setFilterTicker] = useState('');
  const [filterExchange, setFilterExchange] = useState('');

  // Для формы добавления/редактирования
  const [openDialog, setOpenDialog] = useState(false);
  const [editingStock, setEditingStock] = useState(null);
  const [form, setForm] = useState({
    ticker: '',
    isin: '',
    name: '',
    sector: '',
    exchange_id: ''
  });

  useEffect(() => {
    fetchExchanges();
    fetchStocks();
  }, []);

  async function fetchExchanges() {
    const { data, error } = await supabase.from('exchanges').select('exchange_id, name');
    if (!error) setExchanges(data);
  }

  async function fetchStocks() {
    setLoading(true);

    let query = supabase.from('stocks').select('stock_id, ticker, isin, name, sector, exchange_id');

    if (filterTicker) query = query.ilike('ticker', `%${filterTicker}%`);
    if (filterExchange) query = query.eq('exchange_id', filterExchange);

    const { data, error } = await query.order('ticker');
    if (!error) setStocks(data);
    setLoading(false);
  }

  const handleOpenDialog = (stock = null) => {
    if (stock) {
      setEditingStock(stock.stock_id);
      setForm({
        ticker: stock.ticker,
        isin: stock.isin,
        name: stock.name,
        sector: stock.sector,
        exchange_id: stock.exchange_id
      });
    } else {
      setEditingStock(null);
      setForm({ ticker: '', isin: '', name: '', sector: '', exchange_id: '' });
    }
    setOpenDialog(true);
  };

  const handleCloseDialog = () => setOpenDialog(false);

  const handleChange = e => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async () => {
    if (!form.ticker || !form.isin || !form.name || !form.exchange_id) {
      alert('Заполните все обязательные поля');
      return;
    }

    if (editingStock) {
      // обновление
      const { error } = await supabase
        .from('stocks')
        .update({
          ticker: form.ticker,
          isin: form.isin,
          name: form.name,
          sector: form.sector,
          exchange_id: form.exchange_id
        })
        .eq('stock_id', editingStock);

      if (error) {
        alert('Ошибка обновления: ' + error.message);
        return;
      }
    } else {
      // добавление
      const { error } = await supabase
        .from('stocks')
        .insert([form]);

      if (error) {
        alert('Ошибка добавления: ' + error.message);
        return;
      }
    }
    fetchStocks();
    handleCloseDialog();
  };

  const handleDelete = async stock_id => {
    if (!window.confirm('Удалить эту акцию?')) return;
    const { error } = await supabase.from('stocks').delete().eq('stock_id', stock_id);
    if (error) {
      alert('Ошибка удаления: ' + error.message);
      return;
    }
    fetchStocks();
  };

  return (
    <Box>
      <Typography variant="h6" mb={2}>Справочник акций</Typography>

      {/* Фильтры */}
      <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
        <TextField
          label="Тикер"
          value={filterTicker}
          onChange={e => setFilterTicker(e.target.value)}
        />
        <FormControl sx={{ minWidth: 200 }}>
          <InputLabel>Биржа</InputLabel>
          <Select
            value={filterExchange}
            onChange={e => setFilterExchange(e.target.value)}
            label="Биржа"
          >
            <MenuItem value="">Все</MenuItem>
            {exchanges.map(ex => (
              <MenuItem key={ex.exchange_id} value={ex.exchange_id}>{ex.name}</MenuItem>
            ))}
          </Select>
        </FormControl>
        <Button variant="outlined" onClick={fetchStocks}>Применить</Button>
      </Box>

      <Button variant="contained" onClick={() => handleOpenDialog()} sx={{ mb: 2 }}>
        Добавить акцию
      </Button>

      <Table>
        <TableHead>
          <TableRow>
            <TableCell>Тикер</TableCell>
            <TableCell>ISIN</TableCell>
            <TableCell>Название</TableCell>
            <TableCell>Сектор</TableCell>
            <TableCell>Биржа</TableCell>
            <TableCell>Действия</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {stocks.map(stock => {
            const exchangeName = exchanges.find(ex => ex.exchange_id === stock.exchange_id)?.name || '';
            return (
              <TableRow key={stock.stock_id}>
                <TableCell>{stock.ticker}</TableCell>
                <TableCell>{stock.isin}</TableCell>
                <TableCell>{stock.name}</TableCell>
                <TableCell>{stock.sector}</TableCell>
                <TableCell>{exchangeName}</TableCell>
                <TableCell>
                  <IconButton onClick={() => handleOpenDialog(stock)} size="small" color="primary">
                    <EditIcon />
                  </IconButton>
                  <IconButton onClick={() => handleDelete(stock.stock_id)} size="small" color="error">
                    <DeleteIcon />
                  </IconButton>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      {/* Диалог для добавления/редактирования */}
      <Dialog open={openDialog} onClose={handleCloseDialog}>
        <DialogTitle>{editingStock ? 'Редактировать акцию' : 'Добавить акцию'}</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
          <TextField
            label="Тикер"
            name="ticker"
            value={form.ticker}
            onChange={handleChange}
            required
          />
          <TextField
            label="ISIN"
            name="isin"
            value={form.isin}
            onChange={handleChange}
            required
            inputProps={{ maxLength: 12 }}
          />
          <TextField
            label="Название"
            name="name"
            value={form.name}
            onChange={handleChange}
            required
          />
          <TextField
            label="Сектор"
            name="sector"
            value={form.sector}
            onChange={handleChange}
          />
          <FormControl required>
            <InputLabel>Биржа</InputLabel>
            <Select
              name="exchange_id"
              value={form.exchange_id}
              onChange={handleChange}
              label="Биржа"
            >
              {exchanges.map(ex => (
                <MenuItem key={ex.exchange_id} value={ex.exchange_id}>{ex.name}</MenuItem>
              ))}
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>Отмена</Button>
          <Button onClick={handleSubmit} variant="contained">
            {editingStock ? 'Сохранить' : 'Добавить'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
