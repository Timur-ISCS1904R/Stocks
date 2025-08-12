// тот же файл, что мы вернули ранее, плюс поддержка props.filterUserId
import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import {
  Box, Typography, TextField, Select, MenuItem, FormControl, InputLabel,
  Table, TableHead, TableBody, TableRow, TableCell, Paper, CircularProgress,
} from '@mui/material';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';

export default function PortfolioReport({ filterUserId = null }) {
  const [trades, setTrades] = useState([]);
  const [dividends, setDividends] = useState([]);
  const [stocksMap, setStocksMap] = useState({});
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
      if (error) { console.error('Ошибка загрузки акций', error); return; }
      const map = {};
      (data || []).forEach((s) => {
        map[s.stock_id] = { ticker: s.ticker, currency_symbol: s.exchange?.currency?.symbol || '₸' };
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
      if (filterUserId) tradesQuery = tradesQuery.eq('user_id', filterUserId);

      let dividendsQuery = supabase.from('dividends').select('*').order('payment_date', { ascending: false });
      if (dateFrom) dividendsQuery = dividendsQuery.gte('payment_date', dateFrom);
      if (dateTo) dividendsQuery = dividendsQuery.lte('payment_date', dateTo);
      if (filterUserId) dividendsQuery = dividendsQuery.eq('user_id', filterUserId);

      const [{ data: tradesData, error: tradesError }, { data: divData, error: divError }] = await Promise.all([
        tradesQuery, dividendsQuery,
      ]);

      if (tradesError || divError) {
        console.error('Ошибка загрузки данных', tradesError || divError);
        setLoading(false);
        return;
      }

      const tradesWithTicker = (tradesData || []).map(t => ({ ...t, ticker: stocksMap[t.stock_id]?.ticker || '—' }));
      const dividendsWithTicker = (divData || []).map(d => ({ ...d, ticker: stocksMap[d.stock_id]?.ticker || '—' }));

      const filteredTrades = selectedTicker ? tradesWithTicker.filter(t => t.ticker === selectedTicker) : tradesWithTicker;
      const filteredDividends = selectedTicker ? dividendsWithTicker.filter(d => d.ticker === selectedTicker) : dividendsWithTicker;

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
  }, [dateFrom, dateTo, selectedTicker, stocksMap, filterUserId]);

  function formatAmount(v) {
    return v.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  const getCurrencyByTicker = (ticker) => {
    const s = Object.values(stocksMap).find(x => x.ticker === ticker);
    return s?.currency_symbol || '₸';
  };

  const avgBuyPrice = (ticker) => {
    const buys = trades.filter(t => t.trade_type === 'BUY' && t.ticker === ticker);
    const totalQty = buys.reduce((sum, t) => sum + t.quantity, 0);
    if (totalQty === 0) return 0;
    const totalCost = buys.reduce((sum, t) => sum + t.price_per_share * t.quantity, 0);
    return totalCost / totalQty;
  };

  const portfolioValueByAvgPriceByCurrency = () => {
    const pos = {};
    trades.forEach(t => {
      if (!t.ticker) return;
      pos[t.ticker] = (pos[t.ticker] || 0) + (t.trade_type === 'BUY' ? t.quantity : -t.quantity);
    });
    const map = {};
    for (const [ticker, qty] of Object.entries(pos)) {
      if (qty <= 0) continue;
      const avgPrice = avgBuyPrice(ticker);
      const currency = getCurrencyByTicker(ticker);
      map[currency] = (map[currency] || 0) + avgPrice * qty;
    }
    return map;
  };

  const portfolioValueByActualPriceByCurrency = () => {
    const pos = {};
    trades.forEach(t => {
      if (!t.ticker) return;
      pos[t.ticker] = (pos[t.ticker] || 0) + (t.trade_type === 'BUY' ? t.quantity : -t.quantity);
    });
    const map = {};
    for (const [ticker, qty] of Object.entries(pos)) {
      if (qty <= 0) continue;
      const actualPrice = actualPrices[ticker] || avgBuyPrice(ticker);
      const currency = getCurrencyByTicker(ticker);
      map[currency] = (map[currency] || 0) + actualPrice * qty;
    }
    return map;
  };

  const portfolioProfitByCurrency = () => {
    const profitMap = {};
    const pos = {};
    trades.forEach(t => {
      if (!t.ticker) return;
      pos[t.ticker] = (pos[t.ticker] || 0) + (t.trade_type === 'BUY' ? t.quantity : -t.quantity);
    });
    for (const [ticker, qty] of Object.entries(pos)) {
      if (qty <= 0) continue;
      const avgPrice = avgBuyPrice(ticker);
      const actualPrice = actualPrices[ticker] || avgPrice;
      const profit = (actualPrice - avgPrice) * qty;
      const currency = getCurrencyByTicker(ticker);
      profitMap[currency] = (profitMap[currency] || 0) + profit;
    }
    return profitMap;
  };

  const profitByCurrency = () => {
    const profitMap = {};
    const avg = {};
    tickers.forEach(t => (avg[t] = avgBuyPrice(t)));
    const sales = trades.filter(t => t.trade_type === 'SELL');
    sales.forEach(sell => {
      const tk = sell.ticker;
      if (!tk) return;
      const sellAmount = sell.price_per_share * sell.quantity;
      const buyCost = (avg[tk] || 0) * sell.quantity;
      const currency = getCurrencyByTicker(tk);
      profitMap[currency] = (profitMap[currency] || 0) + (sellAmount - buyCost);
    });
    return profitMap;
  };

  const dividendsByCurrency = () => {
    const map = {};
    dividends.forEach(d => {
      if (selectedTicker && d.ticker !== selectedTicker) return;
      const currency = getCurrencyByTicker(d.ticker);
      const amount = d.amount_per_share * d.quantity;
      map[currency] = (map[currency] || 0) + amount;
    });
    return map;
  };

  const handleActualPriceChange = (ticker, value) => {
    setActualPrices(prev => ({ ...prev, [ticker]: Number(value) }));
  };

  const profitByTicker = (() => {
    const res = {};
    const avg = {};
    tickers.forEach(t => (avg[t] = avgBuyPrice(t)));
    const sales = trades.filter(t => t.trade_type === 'SELL');
    sales.forEach(sell => {
      const tk = sell.ticker;
      if (!tk) return;
      const sellAmount = sell.price_per_share * sell.quantity;
      const buyCost = (avg[tk] || 0) * sell.quantity;
      if (!res[tk]) res[tk] = 0;
      res[tk] += sellAmount - buyCost;
    });
    return res;
  })();

  const soldTickers = () => {
    const sells = trades.filter(t => t.trade_type === 'SELL');
    return [...new Set(sells.map(s => s.ticker).filter(t => t !== '—'))];
  };

  const dividendTickers = () => {
    return [...new Set(dividends.map(d => d.ticker).filter(t => t !== '—'))];
  };

  // UI (тот же, только без изменений логики)


  return (
    <Box sx={{ px: { xs: 1, sm: 2 }, py: { xs: 2, sm: 4 }, maxWidth: 900, mx: 'auto' }}>
      <Typography variant="h4" gutterBottom>
        Отчет по портфелю
      </Typography>

      {/* Фильтры */}
      <Box
        sx={{
          display: 'flex',
          gap: 2,
          mb: 3,
          flexWrap: 'wrap',
          '& .MuiFormControl-root': { minWidth: { xs: 140, sm: 150 } },
        }}
      >
        <TextField
          label="С даты"
          type="date"
          value={dateFrom}
          onChange={e => setDateFrom(e.target.value)}
          InputLabelProps={{ shrink: true }}
          sx={{ minWidth: 140 }}
        />
        <TextField
          label="По дату"
          type="date"
          value={dateTo}
          onChange={e => setDateTo(e.target.value)}
          InputLabelProps={{ shrink: true }}
          sx={{ minWidth: 140 }}
        />
        <FormControl sx={{ minWidth: 150 }}>
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
              <MenuItem key={t} value={t}>{t}</MenuItem>
            ))}
          </Select>
        </FormControl>
      </Box>

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
        <Paper sx={{ overflowX: 'auto' }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Тикер</TableCell>
                <TableCell align="right">Средняя цена покупки</TableCell>
                <TableCell align="right">Актуальная цена</TableCell>
                <TableCell align="right">Количество на руках</TableCell>
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
                    <TableCell align="right">{formatAmount(avgPrice)} {currency}</TableCell>
                    <TableCell align="right">
                      <TextField
                        variant="standard"
                        type="number"
                        inputProps={{ step: '0.01' }}
                        value={actualPrices[ticker] ?? ''}
                        onChange={e => handleActualPriceChange(ticker, e.target.value)}
                        sx={{ width: { xs: 72, sm: 90 } }}
                      />
                    </TableCell>
                    <TableCell align="right">{qtyOnHand}</TableCell>
                    <TableCell align="right">{formatAmount(value)} {currency}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Paper>
      )}

      {/* Итоги */}
      <Box sx={{ mt: 4 }}>
        <Typography variant="h6" gutterBottom>Итоги</Typography>

        <Typography>
          <strong>Общая стоимость портфеля (по средней цене покупки):</strong>{' '}
          {Object.entries(portfolioValueByAvgPriceByCurrency()).map(([currency, amount]) => (
            <span key={currency} style={{ marginLeft: 8 }}>
              {formatAmount(amount)} {currency}
            </span>
          ))}
        </Typography>

        <Typography>
          <strong>Общая стоимость портфеля (по актуальной цене):</strong>{' '}
          {Object.entries(portfolioValueByActualPriceByCurrency()).map(([currency, amount]) => (
            <span key={currency} style={{ marginLeft: 8 }}>
              {formatAmount(amount)} {currency}
            </span>
          ))}
        </Typography>

        <Typography
          sx={{
            fontWeight: 'bold',
            color: Object.values(portfolioProfitByCurrency()).reduce((a, b) => a + b, 0) >= 0 ? 'green' : 'red',
          }}
        >
          <strong>Прибыль/Убыток по портфелю:</strong>{' '}
          {Object.entries(portfolioProfitByCurrency()).map(([currency, amount]) => (
            <span key={currency} style={{ marginLeft: 8, color: amount >= 0 ? 'green' : 'red' }}>
              {formatAmount(amount)} {currency}
            </span>
          ))}
        </Typography>

        <Typography variant="subtitle1" sx={{ mt: 2 }}>
          <strong>Прибыль/Убыток с продаж:</strong>
        </Typography>
        {Object.entries(profitByCurrency()).map(([currency, amount]) => (
          <Typography key={currency} sx={{ color: amount >= 0 ? 'green' : 'red', fontWeight: 'bold' }}>
            {formatAmount(amount)} {currency}
          </Typography>
        ))}

        <Typography variant="subtitle1" sx={{ mt: 2 }}>
          <strong>Сумма дивидендов:</strong>
        </Typography>
        {Object.entries(dividendsByCurrency()).map(([currency, amount]) => (
          <Typography key={currency}>
            {formatAmount(amount)} {currency}
          </Typography>
        ))}

        <Box sx={{ mt: 2 }}>
          <Typography variant="subtitle1" gutterBottom>
            <strong>Проданные акции:</strong>{' '}
            {soldTickers().length > 0 ? (
              soldTickers().map(ticker => {
                const profit = profitByTicker[ticker] || 0;
                const isProfit = profit >= 0;
                return (
                  <Box
                    key={ticker}
                    component="span"
                    sx={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      mr: 2,
                      color: isProfit ? 'green' : 'red',
                      fontWeight: 'bold',
                    }}
                  >
                    {ticker}{' '}
                    {isProfit ? <ArrowUpwardIcon fontSize="small" /> : <ArrowDownwardIcon fontSize="small" />}
                  </Box>
                );
              })
            ) : (
              'нет'
            )}
          </Typography>

          <Typography variant="subtitle1">
            <strong>Акции с дивидендами:</strong>{' '}
            {dividendTickers().length > 0 ? dividendTickers().join(', ') : 'нет'}
          </Typography>
        </Box>
      </Box>
    </Box>
  );
}
