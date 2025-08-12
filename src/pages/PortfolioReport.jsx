import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import {
  Box,
  Typography,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  Paper,
  CircularProgress,
  Grid,
  TableContainer,
} from '@mui/material';

export default function PortfolioReport() {
  const [trades, setTrades] = useState([]);
  const [dividends, setDividends] = useState([]);
  const [stocksMap, setStocksMap] = useState({}); // { stock_id: { ticker, currency_symbol } }
  const [tickers, setTickers] = useState([]);
  const [selectedTicker, setSelectedTicker] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [actualPrices, setActualPrices] = useState({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function fetchStocks() {
      const { data, error } = await supabase
        .from('stocks')
        .select('stock_id, ticker, exchange_id, exchange:exchanges(currency:currencies(symbol))');
      if (error) {
        console.error('Ошибка загрузки акций', error);
        return;
      }
      const map = {};
      data.forEach((s) => {
        map[s.stock_id] = {
          ticker: s.ticker,
          currency_symbol: s.exchange?.currency?.symbol || '₸',
        };
      });
      setStocksMap(map);
    }
    fetchStocks();
  }, []);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      let tradesQuery = supabase.from('trades').select('*').order('trade_date', { ascending: false });
      if (dateFrom) tradesQuery = tradesQuery.gte('trade_date', dateFrom);
      if (dateTo) tradesQuery = tradesQuery.lte('trade_date', dateTo);
      let dividendsQuery = supabase.from('dividends').select('*').order('payment_date', { ascending: false });
      if (dateFrom) dividendsQuery = dividendsQuery.gte('payment_date', dateFrom);
      if (dateTo) dividendsQuery = dividendsQuery.lte('payment_date', dateTo);

      const [{ data: tradesData, error: tradesError }, { data: divData, error: divError }] = await Promise.all([
        tradesQuery,
        dividendsQuery,
      ]);

      if (tradesError || divError) {
        console.error('Ошибка загрузки данных', tradesError || divError);
        setLoading(false);
        return;
      }

      const tradesWithTicker = (tradesData || []).map(t => ({
        ...t,
        ticker: stocksMap[t.stock_id]?.ticker || '—',
      }));

      const dividendsWithTicker = (divData || []).map(d => ({
        ...d,
        ticker: stocksMap[d.stock_id]?.ticker || '—',
      }));

      const filteredTrades = selectedTicker
        ? tradesWithTicker.filter(t => t.ticker === selectedTicker)
        : tradesWithTicker;

      const filteredDividends = selectedTicker
        ? dividendsWithTicker.filter(d => d.ticker === selectedTicker)
        : dividendsWithTicker;

      setTrades(filteredTrades);
      setDividends(filteredDividends);

      const uniqueTickersSet = new Set([
        ...filteredTrades.map(t => t.ticker).filter(t => t !== '—'),
        ...filteredDividends.map(d => d.ticker).filter(t => t !== '—'),
      ]);
      setTickers([...uniqueTickersSet].sort());

      setLoading(false);
    }
    fetchData();
  }, [dateFrom, dateTo, selectedTicker, stocksMap]);

  function formatAmount(value) {
    return value.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  const getCurrencyByTicker = (ticker) => {
    const stockEntry = Object.values(stocksMap).find(s => s.ticker === ticker);
    return stockEntry?.currency_symbol || '₸';
  };

  const avgBuyPrice = (ticker) => {
    const buys = trades.filter(t => t.trade_type === 'BUY' && t.ticker === ticker);
    const totalQty = buys.reduce((sum, t) => sum + t.quantity, 0);
    if (totalQty === 0) return 0;
    const totalCost = buys.reduce((sum, t) => sum + t.price_per_share * t.quantity, 0);
    return totalCost / totalQty;
    };

  const portfolioValueByAvgPriceByCurrency = () => {
    const positions = {};
    trades.forEach(t => {
      if (!t.ticker) return;
      const tk = t.ticker;
      positions[tk] = (positions[tk] || 0) + (t.trade_type === 'BUY' ? t.quantity : -t.quantity);
    });
    const valueByCurrency = {};
    for (const [ticker, qty] of Object.entries(positions)) {
      if (qty <= 0) continue;
      const avgPrice = avgBuyPrice(ticker);
      const currency = getCurrencyByTicker(ticker);
      valueByCurrency[currency] = (valueByCurrency[currency] || 0) + avgPrice * qty;
    }
    return valueByCurrency;
  };

  const handleActualPriceChange = (ticker, value) => {
    setActualPrices(prev => ({
      ...prev,
      [ticker]: Number(value),
    }));
  };

  const soldTickers = () => {
    const sells = trades.filter(t => t.trade_type === 'SELL');
    const unique = [...new Set(sells.map(s => s.ticker).filter(t => t !== '—'))];
    return unique;
  };

  const dividendTickers = () => {
    const unique = [...new Set(dividends.map(d => d.ticker).filter(t => t !== '—'))];
    return unique;
  };

  return (
    <Box sx={{ padding: 4, maxWidth: 900, margin: '0 auto' }}>
      <Typography variant="h4" gutterBottom>
        Отчет по портфелю
      </Typography>

      {/* Фильтры */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={3}>
          <TextField
            fullWidth
            label="С даты"
            type="date"
            value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
            InputLabelProps={{ shrink: true }}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <TextField
            fullWidth
            label="По дату"
            type="date"
            value={dateTo}
            onChange={e => setDateTo(e.target.value)}
            InputLabelProps={{ shrink: true }}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <FormControl fullWidth>
            <InputLabel id="ticker-label">Тикер</InputLabel>
            <Select
              labelId="ticker-label"
              value={selectedTicker}
              label="Тикер"
              onChange={e => setSelectedTicker(e.target.value)}
            >
              <MenuItem value="">
                <em>Все</em>
              </MenuItem>
              {tickers.map(t => (
                <MenuItem key={t} value={t}>
                  {t}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Grid>
      </Grid>

      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', my: 5 }}>
          <CircularProgress />
        </Box>
      )}

      {!loading && tickers.length === 0 && (
        <Typography variant="body1" color="text.secondary">
          Нет данных для отображения
        </Typography>
      )}

      {!loading && tickers.length > 0 && (
        <TableContainer component={Paper} sx={{ width: '100%', overflowX: 'auto' }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Тикер</TableCell>
                <TableCell align="right">Средняя цена покупки</TableCell>
                <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>Актуальная цена</TableCell>
                <TableCell align="right" sx={{ display: { xs: 'none', sm: 'table-cell' } }}>Количество</TableCell>
                <TableCell align="right">Стоимость портфеля</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {tickers.map(ticker => {
                const buys = trades.filter(t => t.trade_type === 'BUY' && t.ticker === ticker);
                const totalQtyBought = buys.reduce((sum, t) => sum + t.quantity, 0);
                const sells = trades.filter(t => t.trade_type === 'SELL' && t.ticker === ticker);
                const totalQtySold = sells.reduce((sum, t) => sum + t.quantity, 0);
                const qtyOnHand = totalQtyBought - totalQtySold;
                if (qtyOnHand <= 0) return null;

                const avgPrice = avgBuyPrice(ticker);
                const actualPrice = actualPrices[ticker] || avgPrice;
                const value = qtyOnHand * actualPrice;
                const currency = getCurrencyByTicker(ticker);

                return (
                  <TableRow key={ticker}>
                    <TableCell>{ticker}</TableCell>
                    <TableCell align="right">
                      {avgPrice.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {currency}
                    </TableCell>
                    <TableCell align="right">
                      <TextField
                        variant="standard"
                        type="number"
                        fullWidth
                        inputProps={{ step: '0.01' }}
                        value={actualPrices[ticker] ?? ''}
                        onChange={e => handleActualPriceChange(ticker, e.target.value)}
                      />
                    </TableCell>
                    <TableCell align="right" sx={{ display: { xs: 'none', sm: 'table-cell' } }}>
                      {qtyOnHand}
                    </TableCell>
                    <TableCell align="right">
                      {value.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {currency}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  );
}
