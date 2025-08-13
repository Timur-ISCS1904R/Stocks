import React, { useEffect, useState } from 'react';
import {
  Box, Button, Dialog, DialogActions, DialogContent, DialogTitle,
  TextField, Select, MenuItem, InputLabel, FormControl, Table, TableBody,
  TableCell, TableHead, TableRow, IconButton, Typography,
  Grid, TableContainer, Paper
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import { supabase } from '../supabaseClient';

export default function StocksPage({ readOnlyDicts = false }) {
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
      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid item xs={12} sm={6} md={4}>
          <TextField
            fullWidth
            label="Тикер"
            value={filterTicker}
            onChange={e => setFilterTicker(e.target.value)}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={6}>
          <FormControl fullWidth>
            <InputLabel>Биржа</InputLabel>
            <Select
              fullWidth
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
        </Grid>
        <Grid item xs={12} sm="auto">
          <Button variant="outlined" fullWidth onClick={fetchStocks}>Применить</Button>
        </Grid>
      </Grid>

      <Button variant="contained" onClick={() => handleOpenDialog()} disabled={readOnlyDicts}>Добавить</Button>

      <TableContainer component={Paper} sx={{ width: '100%', overflowX: 'auto' }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Тикер</TableCell>
              <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>ISIN</TableCell>
              <TableCell>Название</TableCell>
              <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>Сектор</TableCell>
              <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>Биржа</TableCell>
              <TableCell>Действия</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {stocks.map(stock => {
              const exchangeName = exchanges.find(ex => ex.exchange_id === stock.exchange_id)?.name || '';
              return (
                <TableRow key={stock.stock_id}>
                  <TableCell>{stock.ticker}</TableCell>
                  <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>{stock.isin}</TableCell>
                  <TableCell>{stock.name}</TableCell>
                  <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>{stock.sector}</TableCell>
                  <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>{exchangeName}</TableCell>
                  <TableCell>
                    {!readOnlyDicts && (
                      <>
                        <IconButton onClick={() => handleOpenDialog(stock)} size="small">
                          <EditIcon fontSize="small" />
                        </IconButton>
                        <IconButton onClick={() => handleDelete(stock.stock_id)} size="small" color="error">
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
            {stocks.length === 0 && (
              <TableRow><TableCell colSpan={6}>Нет данных</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Диалог для добавления/редактирования */}
      <Dialog open={openDialog} onClose={handleCloseDialog} fullWidth maxWidth="sm">
        <DialogTitle>{editingStock ? 'Редактировать акцию' : 'Добавить акцию'}</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
          <TextField
            fullWidth
            label="Тикер"
            name="ticker"
            value={form.ticker}
            onChange={handleChange}
            required
          />
          <TextField
            fullWidth
            label="ISIN"
            name="isin"
            value={form.isin}
            onChange={handleChange}
            required
          />
          <TextField
            fullWidth
            label="Название"
            name="name"
            value={form.name}
            onChange={handleChange}
            required
          />
          <TextField
            fullWidth
            label="Сектор"
            name="sector"
            value={form.sector}
            onChange={handleChange}
          />
          <FormControl fullWidth>
            <InputLabel>Биржа</InputLabel>
            <Select
              name="exchange_id"
              value={form.exchange_id}
              onChange={handleChange}
              label="Биржа"
              required
            >
              {exchanges.map(ex => (
                <MenuItem key={ex.exchange_id} value={ex.exchange_id}>{ex.name}</MenuItem>
              ))}
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>Отмена</Button>
          <Button onClick={handleSubmit} variant="contained">Сохранить</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
