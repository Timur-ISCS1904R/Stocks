import React, { useEffect, useState } from 'react';
import {
  Box, Button, Dialog, DialogActions, DialogContent, DialogTitle,
  TextField, Table, TableBody, TableCell, TableHead, TableRow, IconButton, Typography
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import { supabase } from '../supabaseClient';

export default function ExchangesPage() {
  const [exchanges, setExchanges] = useState([]);
  const [loading, setLoading] = useState(false);

  const [openDialog, setOpenDialog] = useState(false);
  const [editingExchange, setEditingExchange] = useState(null);
  const [form, setForm] = useState({
    name: '',
    code: '',
    country: ''
  });

  useEffect(() => {
    fetchExchanges();
  }, []);

  async function fetchExchanges() {
    setLoading(true);
    const { data, error } = await supabase
      .from('exchanges')
      .select('*')
      .order('name');
    if (!error) setExchanges(data);
    setLoading(false);
  }

  const handleOpenDialog = (exchange = null) => {
    if (exchange) {
      setEditingExchange(exchange.exchange_id);
      setForm({
        name: exchange.name,
        code: exchange.code,
        country: exchange.country,
      });
    } else {
      setEditingExchange(null);
      setForm({ name: '', code: '', country: '' });
    }
    setOpenDialog(true);
  };

  const handleCloseDialog = () => setOpenDialog(false);

  const handleChange = e => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async () => {
    if (!form.name || !form.code || !form.country) {
      alert('Заполните все поля');
      return;
    }

    if (editingExchange) {
      // обновление
      const { error } = await supabase
        .from('exchanges')
        .update(form)
        .eq('exchange_id', editingExchange);

      if (error) {
        alert('Ошибка обновления: ' + error.message);
        return;
      }
    } else {
      // добавление
      const { error } = await supabase
        .from('exchanges')
        .insert([form]);

      if (error) {
        alert('Ошибка добавления: ' + error.message);
        return;
      }
    }
    fetchExchanges();
    handleCloseDialog();
  };

  const handleDelete = async (exchange_id) => {
    if (!window.confirm('Удалить эту биржу?')) return;
    const { error } = await supabase
      .from('exchanges')
      .delete()
      .eq('exchange_id', exchange_id);
    if (error) {
      alert('Ошибка удаления: ' + error.message);
      return;
    }
    fetchExchanges();
  };

  return (
    <Box>
      <Typography variant="h6" mb={2}>Справочник бирж</Typography>

      <Button variant="contained" onClick={() => handleOpenDialog()} sx={{ mb: 2 }}>
        Добавить биржу
      </Button>

      <Table>
        <TableHead>
          <TableRow>
            <TableCell>Название</TableCell>
            <TableCell>Код</TableCell>
            <TableCell>Страна</TableCell>
            <TableCell>Действия</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {exchanges.map(exchange => (
            <TableRow key={exchange.exchange_id}>
              <TableCell>{exchange.name}</TableCell>
              <TableCell>{exchange.code}</TableCell>
              <TableCell>{exchange.country}</TableCell>
              <TableCell>
                <IconButton onClick={() => handleOpenDialog(exchange)} size="small" color="primary">
                  <EditIcon />
                </IconButton>
                <IconButton onClick={() => handleDelete(exchange.exchange_id)} size="small" color="error">
                  <DeleteIcon />
                </IconButton>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Dialog open={openDialog} onClose={handleCloseDialog}>
        <DialogTitle>{editingExchange ? 'Редактировать биржу' : 'Добавить биржу'}</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
          <TextField
            label="Название"
            name="name"
            value={form.name}
            onChange={handleChange}
            required
          />
          <TextField
            label="Код"
            name="code"
            value={form.code}
            onChange={handleChange}
            required
            inputProps={{ maxLength: 10 }}
          />
          <TextField
            label="Страна"
            name="country"
            value={form.country}
            onChange={handleChange}
            required
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>Отмена</Button>
          <Button onClick={handleSubmit} variant="contained">
            {editingExchange ? 'Сохранить' : 'Добавить'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
