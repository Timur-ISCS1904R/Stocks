// src/pages/BuyPage.jsx
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../supabaseClient';
import { useErrorHandler } from '../lib/errorHandler';

import {
  Box, TextField, Button, Select, MenuItem, InputLabel, FormControl, Table,
  TableBody, TableCell, TableHead, TableRow, IconButton, Stack,
  Grid, TableContainer, Paper, Alert, CircularProgress, Tooltip
} from '@mui/material';

import DeleteIcon from '@mui/icons-material/Delete';
import RefreshIcon from '@mui/icons-material/Refresh';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';

import { LocalizationProvider, DatePicker } from '@mui/x-date-pickers';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import ruLocale from 'date-fns/locale/ru';

function formatCurrency(value, symbol) {
  if (isNaN(value) || value === null || value === undefined) return '0.00 ' + symbol;
  
  return (
    new Intl.NumberFormat('ru-RU', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
      useGrouping: true,
    }), []);

  const {
    state: form,
    errors: formErrors,
    updateField,
    validate: validateForm,
    reset: resetForm
  } = useFormState({
    ticker: '',
    price: '',
    date: '',
    quantity: ''
  }, formValidators);

  const [dateValue, setDateValue] = useState(null);

  // Фильтры
  const [filterTicker, setFilterTicker] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState(null);
  const [filterDateTo, setFilterDateTo] = useState(null);

  // Загрузка справочников
  const loadExchanges = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('exchanges')
        .select('exchange_id, name, currency:currencies(symbol)');
      
      if (error) throw error;
      
      setExchanges(data || []);
      console.log('✅ Exchanges loaded:', data?.length || 0);
    } catch (error) {
      handleError(error, { component: 'BuyPage', action: 'loadExchanges' });
    }
  }, [handleError]);

  const loadStocks = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('stocks')
        .select('stock_id, ticker, exchange_id, name');
      
      if (error) throw error;
      
      setAllStocks(data || []);
      console.log('✅ Stocks loaded:', data?.length || 0);
    } catch (error) {
      handleError(error, { component: 'BuyPage', action: 'loadStocks' });
    }
  }, [handleError]);

  const loadTrades = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('trades')
        .select('*')
        .eq('trade_type', 'BUY')
        .order('trade_date', { ascending: false })
        .limit(500); // Ограничиваем количество для производительности
      
      if (error) throw error;
      
      setTrades(data || []);
      console.log('✅ Trades loaded:', data?.length || 0);
    } catch (error) {
      handleError(error, { component: 'BuyPage', action: 'loadTrades' });
    }
  }, [handleError]);

  // Инициализация данных
  useEffect(() => {
    const initializeData = async () => {
      setInitialLoading(true);
      clearError();
      
      try {
        await Promise.all([
          loadExchanges(),
          loadStocks(),
          loadTrades()
        ]);
      } catch (error) {
        console.error('Failed to initialize data:', error);
      } finally {
        setInitialLoading(false);
      }
    };

    initializeData();
  }, [loadExchanges, loadStocks, loadTrades, clearError]);

  // Фильтрация акций по выбранной бирже
  useEffect(() => {
    if (!selectedExchange) {
      setStocks([]);
      updateField('ticker', '');
      return;
    }
    
    const exchangeStocks = allStocks.filter(s => s.exchange_id === selectedExchange.exchange_id);
    setStocks(exchangeStocks);
    
    // Сброс тикера если он не подходит новой бирже
    if (form.ticker && !exchangeStocks.find(s => s.ticker === form.ticker)) {
      updateField('ticker', '');
    }
  }, [selectedExchange, allStocks, form.ticker, updateField]);

  // Фильтрация сделок
  useEffect(() => {
    let filtered = trades;

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

  // Обработчики форм
  const handleExchangeChange = useCallback((exchangeId) => {
    const ex = exchanges.find(x => x.exchange_id === exchangeId);
    setSelectedExchange(ex || null);
  }, [exchanges]);

  const handleDateChange = useCallback((newValue) => {
    setDateValue(newValue);
    const formattedDate = formatDateToYYYYMMDD(newValue);
    updateField('date', formattedDate);
  }, [updateField]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    clearError();

    if (!validateForm()) {
      return;
    }

    const stock = stocks.find(s => s.ticker === form.ticker);
    if (!stock) {
      handleError(new Error('Выберите корректный тикер'), { 
        component: 'BuyPage', 
        action: 'submit',
        ticker: form.ticker 
      });
      return;
    }

    setSubmitting(true);

    try {
      const price = parseFloat(form.price);
      const quantity = parseInt(form.quantity, 10);
      const total_amount = price * quantity;

      console.log('💰 Submitting buy order:', {
        stock_id: stock.stock_id,
        ticker: stock.ticker,
        price,
        quantity,
        total_amount,
        date: form.date
      });

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
        console.error('❌ Database error:', error);
        throw error;
      }

      if (!data || data.length === 0) {
        throw new Error('Не удалось получить данные добавленной сделки');
      }

      // Успешное добавление
      setTrades(prev => [data[0], ...prev]);
      resetForm();
      setDateValue(null);
      
      console.log('✅ Trade added successfully:', data[0]);

    } catch (error) {
      handleError(error, {
        component: 'BuyPage',
        action: 'submit',
        formData: form
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (tradeId) => {
    if (!window.confirm('Удалить эту сделку?')) return;

    try {
      console.log('🗑️ Deleting trade:', tradeId);
      
      const { error } = await supabase
        .from('trades')
        .delete()
        .eq('trade_id', tradeId);

      if (error) throw error;

      setTrades(prev => prev.filter(t => t.trade_id !== tradeId));
      console.log('✅ Trade deleted successfully');

    } catch (error) {
      handleError(error, {
        component: 'BuyPage',
        action: 'delete',
        tradeId
      });
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    clearError();
    
    await withErrorHandling(async () => {
      await Promise.all([
        loadExchanges(),
        loadStocks(), 
        loadTrades()
      ]);
    }, { component: 'BuyPage', action: 'refresh' });
    
    setRefreshing(false);
  };

  // Мемоизированные вычисления для производительности
  const totalInvestment = useMemo(() => {
    return filteredTrades.reduce((sum, trade) => sum + (trade.total_amount || 0), 0);
  }, [filteredTrades]);

  const totalShares = useMemo(() => {
    return filteredTrades.reduce((sum, trade) => sum + (trade.quantity || 0), 0);
  }, [filteredTrades]);

  if (initialLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      {/* Глобальные ошибки */}
      {error && (
        <Alert 
          severity="error" 
          sx={{ mb: 2 }}
          onClose={clearError}
          action={
            <Button size="small" onClick={handleRefresh}>
              Повторить
            </Button>
          }
        >
          {error.message}
        </Alert>
      )}

      {/* Заголовок с кнопкой обновления */}
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          <TrendingUpIcon sx={{ mr: 1, color: 'success.main' }} />
          <Box>
            <Box sx={{ fontWeight: 'bold', fontSize: '1.1rem' }}>
              Покупка акций
            </Box>
            <Box sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>
              {filteredTrades.length} сделок • {totalShares} акций • {formatCurrency(totalInvestment, '₸')}
            </Box>
          </Box>
        </Box>
        
        <Tooltip title="Обновить данные">
          <IconButton onClick={handleRefresh} disabled={refreshing}>
            <RefreshIcon />
          </IconButton>
        </Tooltip>
      </Stack>

      {/* Форма добавления */}
      <form onSubmit={handleSubmit}>
        <Grid container spacing={2} sx={{ mb: 2 }}>
          <Grid item xs={12} sm={6} md="auto">
            <FormControl 
              fullWidth 
              sx={{ minWidth: { md: 150 } }}
              error={!!formErrors.exchange}
            >
              <InputLabel>Биржа</InputLabel>
              <Select
                value={selectedExchange ? selectedExchange.exchange_id : ''}
                label="Биржа"
                onChange={e => handleExchangeChange(e.target.value)}
                required
              >
                <MenuItem value=""><em>Выберите</em></MenuItem>
                {exchanges.map(ex => (
                  <MenuItem key={ex.exchange_id} value={ex.exchange_id}>
                    {ex.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>

          <Grid item xs={12} sm={6} md="auto">
            <FormControl 
              fullWidth 
              sx={{ minWidth: { md: 150 } }}
              error={!!formErrors.ticker}
            >
              <InputLabel>Тикер</InputLabel>
              <Select
                value={form.ticker}
                label="Тикер"
                onChange={e => updateField('ticker', e.target.value)}
                required
                disabled={!selectedExchange}
              >
                <MenuItem value=""><em>Выберите</em></MenuItem>
                {stocks.map(stock => (
                  <MenuItem key={stock.stock_id} value={stock.ticker}>
                    {stock.ticker}
                    {stock.name && (
                      <Box component="span" sx={{ ml: 1, fontSize: '0.8rem', opacity: 0.7 }}>
                        ({stock.name.slice(0, 20)}{stock.name.length > 20 ? '...' : ''})
                      </Box>
                    )}
                  </MenuItem>
                ))}
              </Select>
              {formErrors.ticker && (
                <Box sx={{ color: 'error.main', fontSize: '0.75rem', mt: 0.5 }}>
                  {formErrors.ticker}
                </Box>
              )}
            </FormControl>
          </Grid>

          <Grid item xs={6} sm={4} md="auto">
            <TextField
              fullWidth
              label="Цена"
              value={form.price}
              onChange={e => updateField('price', e.target.value)}
              type="number"
              inputProps={{ step: "0.0001", min: "0" }}
              required
              error={!!formErrors.price}
              helperText={formErrors.price}
            />
          </Grid>

          <Grid item xs={6} sm={4} md="auto">
            <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={ruLocale}>
              <DatePicker
                label="Дата"
                value={dateValue}
                onChange={handleDateChange}
                maxDate={new Date()}
                renderInput={(params) => (
                  <TextField 
                    {...params} 
                    required 
                    fullWidth
                    error={!!formErrors.date}
                    helperText={formErrors.date}
                  />
                )}
              />
            </LocalizationProvider>
          </Grid>

          <Grid item xs={6} sm={4} md="auto">
            <TextField
              fullWidth
              label="Количество"
              value={form.quantity}
              onChange={e => updateField('quantity', e.target.value)}
              type="number"
              inputProps={{ min: "1" }}
              required
              error={!!formErrors.quantity}
              helperText={formErrors.quantity}
            />
          </Grid>

          <Grid item xs={12} sm="auto">
            <Button 
              variant="contained" 
              type="submit" 
              fullWidth 
              sx={{ height: '100%' }}
              disabled={submitting}
            >
              {submitting ? 'Добавляю...' : 'Добавить'}
            </Button>
          </Grid>
        </Grid>
      </form>

      {/* Предварительный расчет */}
      {form.price && form.quantity && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Общая сумма: {formatCurrency(parseFloat(form.price || 0) * parseInt(form.quantity || 0, 10), 
            selectedExchange?.currency?.symbol || '₸')}
        </Alert>
      )}

      {/* Фильтры */}
      <Box sx={{ mb: 2 }}>
        <Grid container spacing={2}>
          <Grid item xs={12} sm={6} md={4}>
            <TextField
              fullWidth
              label="Фильтр по тикеру"
              value={filterTicker}
              onChange={e => setFilterTicker(e.target.value)}
            />
          </Grid>
          <Grid item xs={6} sm={3} md="auto">
            <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={ruLocale}>
              <DatePicker
                label="Дата с"
                value={filterDateFrom}
                onChange={setFilterDateFrom}
                renderInput={(params) => <TextField {...params} fullWidth />}
              />
            </LocalizationProvider>
          </Grid>
          <Grid item xs={6} sm={3} md="auto">
            <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={ruLocale}>
              <DatePicker
                label="Дата по"
                value={filterDateTo}
                onChange={setFilterDateTo}
                renderInput={(params) => <TextField {...params} fullWidth />}
              />
            </LocalizationProvider>
          </Grid>
        </Grid>
      </Box>

      {/* Таблица сделок */}
      <TableContainer component={Paper} sx={{ width: '100%', overflowX: 'auto' }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Дата</TableCell>
              <TableCell>Тикер</TableCell>
              <TableCell align="right">Цена</TableCell>
              <TableCell align="right" sx={{ display: { xs: 'none', sm: 'table-cell' } }}>
                Кол-во
              </TableCell>
              <TableCell align="right">Сумма</TableCell>
              <TableCell align="center">Действия</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredTrades.map(trade => {
              const stock = allStocks.find(s => s.stock_id === trade.stock_id);
              const exchange = exchanges.find(e => e.exchange_id === stock?.exchange_id);
              const currency = exchange?.currency?.symbol || '₸';
              
              return (
                <TableRow key={trade.trade_id}>
                  <TableCell>{trade.trade_date}</TableCell>
                  <TableCell>
                    <Box>
                      <Box sx={{ fontWeight: 'medium' }}>
                        {stock?.ticker || '—'}
                      </Box>
                      {stock?.name && (
                        <Box sx={{ fontSize: '0.75rem', opacity: 0.7 }}>
                          {stock.name.slice(0, 30)}{stock.name.length > 30 ? '...' : ''}
                        </Box>
                      )}
                    </Box>
                  </TableCell>
                  <TableCell align="right">
                    {formatCurrency(trade.price_per_share, currency)}
                  </TableCell>
                  <TableCell align="right" sx={{ display: { xs: 'none', sm: 'table-cell' } }}>
                    {trade.quantity}
                  </TableCell>
                  <TableCell align="right">
                    <Box sx={{ fontWeight: 'medium' }}>
                      {formatCurrency(trade.total_amount, currency)}
                    </Box>
                  </TableCell>
                  <TableCell align="center">
                    <Tooltip title="Удалить сделку">
                      <IconButton 
                        onClick={() => handleDelete(trade.trade_id)} 
                        size="small" 
                        color="error"
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              );
            })}
            {filteredTrades.length === 0 && !loading && (
              <TableRow>
                <TableCell colSpan={6} sx={{ textAlign: 'center', py: 4, color: 'text.secondary' }}>
                  {trades.length === 0 ? 'Нет покупок' : 'Не найдено сделок по заданным фильтрам'}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
          <CircularProgress size={24} />
        </Box>
      )}
    </Box>
  );
}).format(value) + ' ' + symbol
  );
}

const formatDateToYYYYMMDD = (date) => {
  if (!date || isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// Кастомный хук для управления состоянием форм с валидацией
function useFormState(initialState, validators = {}) {
  const [state, setState] = useState(initialState);
  const [errors, setErrors] = useState({});
  
  const updateField = useCallback((field, value) => {
    setState(prev => ({ ...prev, [field]: value }));
    
    // Очищаем ошибку при изменении поля
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: null }));
    }
  }, [errors]);

  const validate = useCallback(() => {
    const newErrors = {};
    
    Object.entries(validators).forEach(([field, validator]) => {
      const error = validator(state[field], state);
      if (error) {
        newErrors[field] = error;
      }
    });

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [state, validators]);

  const reset = useCallback(() => {
    setState(initialState);
    setErrors({});
  }, [initialState]);

  return {
    state,
    errors,
    updateField,
    validate,
    reset,
    hasErrors: Object.keys(errors).length > 0
  };
}

export default function BuyPage() {
  const { error, loading, handleError, clearError, withErrorHandling } = useErrorHandler();
  
  // Данные справочников
  const [exchanges, setExchanges] = useState([]);
  const [allStocks, setAllStocks] = useState([]);
  const [stocks, setStocks] = useState([]);
  const [selectedExchange, setSelectedExchange] = useState(null);

  // Данные сделок
  const [trades, setTrades] = useState([]);
  const [filteredTrades, setFilteredTrades] = useState([]);
  
  // Состояния загрузки
  const [initialLoading, setInitialLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Форма добавления сделки
  const formValidators = useMemo(() => ({
    ticker: (value) => !value ? 'Выберите тикер' : null,
    price: (value) => {
      if (!value) return 'Введите цену';
      const num = parseFloat(value);
      if (isNaN(num) || num <= 0) return 'Цена должна быть больше 0';
      if (num > 1000000) return 'Цена слишком большая';
      return null;
    },
    quantity: (value) => {
      if (!value) return 'Введите количество';
      const num = parseInt(value, 10);
      if (isNaN(num) || num <= 0) return 'Количество должно быть больше 0';
      if (num > 1000000) return 'Количество слишком большое';
      return null;
    },
    date: (value) => !value ? 'Выберите дату сделки' : null
  }