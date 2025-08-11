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
} from '@mui/material';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';

function formatCurrency(value, currency) {
  if (value == null) return '';
  return (
    new Intl.NumberFormat('ru-RU', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
      useGrouping: true,
    }).format(value) + ' ' + currency
  );
}

export default function PortfolioReport() {
  const [trades, setTrades] = useState([]);
  const [dividends, setDividends] = useState([]);
  const [stocksMap, setStocksMap] = useState({});
  const [exchangesMap, setExchangesMap] = useState({});
  const [tickers, setTickers] = useState([]);
  const [selectedTicker, setSelectedTicker] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [actualPrices, setActualPrices] = useState({});
  const [loading, setLoading] = useState(false);

  // Получаем акции + тикеры + валюту биржи
  useEffect(() => {
    async function fetchStocksAndExchanges() {
      // получаем акции с их биржами и валютами
      const { data, error } = await supabase
        .from('stocks')
        .select(`
          stock_id,
          ticker,
          exchange:exchange_id (
            exchange_id,
            currency:currencies(symbol)
          )
        `);

      if (error) {
        console.error('Ошибка загрузки акций и бирж', error);
        return;
      }
      const stocks = {};
      const exchanges = {};
      data.forEach((item) => {
        stocks[item.stock_id] = {
          ticker: item.ticker,
          exchange_id: item.exchange.exchange_id,
          currency: item.exchange.currency.symbol,
        };
        exchanges[item.exchange.exchange_id] = item.exchange.currency.symbol;
      });
      setStocksMap(stocks);
      setExchangesMap(exchanges);
    }
    fetchStocksAndExchanges();
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

      const tradesWithTicker = (tradesData || []).map((t) => {
        const stock = stocksMap[t.stock_id];
        return {
          ...t,
          ticker: stock?.ticker || '—',
          currency: stock?.currency || '',
        };
      });

      const dividendsWithTicker = (divData || []).map((d) => {
        const stock = stocksMap[d.stock_id];
        return {
          ...d,
          ticker: stock?.ticker || '—',
          currency: stock?.currency || '',
        };
      });

      const filteredTrades = selectedTicker
        ? tradesWithTicker.filter((t) => t.ticker === selectedTicker)
        : tradesWithTicker;

      const filteredDividends = selectedTicker
        ? dividendsWithTicker.filter((d) => d.ticker === selectedTicker)
        : dividendsWithTicker;

      setTrades(filteredTrades);
      setDividends(filteredDividends);

      const uniqueTickersSet = new Set([
        ...filteredTrades.map((t) => t.ticker).filter((t) => t !== '—'),
        ...filteredDividends.map((d) => d.ticker).filter((t) => t !== '—'),
      ]);
      setTickers([...uniqueTickersSet].sort());

      setLoading(false);
    }
    fetchData();
  }, [dateFrom, dateTo, selectedTicker, stocksMap]);

  const avgBuyPrice = (ticker) => {
    const buys = trades.filter((t) => t.trade_type === 'BUY' && t.ticker === ticker);
    const totalQty = buys.reduce((sum, t) => sum + t.quantity, 0);
    if (totalQty === 0) return 0;
    const totalCost = buys.reduce((sum, t) => sum + t.price_per_share * t.quantity, 0);
    return totalCost / totalQty;
  };

  const portfolioPositions = () => {
    const positions = {};
    trades.forEach((t) => {
      if (!t.ticker) return;
      const tk = t.ticker;
      positions[tk] = (positions[tk] || 0) + (t.trade_type === 'BUY' ? t.quantity : -t.quantity);
    });
    return positions;
  };

  // Стоимость по средней цене, разбитая по валютам
  const portfolioValueByAvgPrice = () => {
    const positions = portfolioPositions();
    const sumsByCurrency = {};
    for (const [ticker, qty] of Object.entries(positions)) {
      if (qty <= 0) continue;
      const avgPrice = avgBuyPrice(ticker);
      const currency = trades.find(t => t.ticker === ticker)?.currency || '';
      sumsByCurrency[currency] = (sumsByCurrency[currency] || 0) + avgPrice * qty;
    }
    return sumsByCurrency;
  };

  // Стоимость по актуальной цене, разбитая по валютам
  const portfolioValueByActualPrice = () => {
    const positions = portfolioPositions();
    const sumsByCurrency = {};
    for (const [ticker, qty] of Object.entries(positions)) {
      if (qty <= 0) continue;
      const actualPrice = actualPrices[ticker] || avgBuyPrice(ticker);
      const currency = trades.find(t => t.ticker === ticker)?.currency || '';
      sumsByCurrency[currency] = (sumsByCurrency[currency] || 0) + actualPrice * qty;
    }
    return sumsByCurrency;
  };

  const totalDividends = () => {
    return dividends.reduce((sum, d) => {
      if (selectedTicker && d.ticker !== selectedTicker) return sum;
      return sum + d.amount_per_share * d.quantity;
    }, 0);
  };

  const totalProfit = () => {
    let profit = 0;
    const avgPrices = {};
    tickers.forEach((ticker) => (avgPrices[ticker] = avgBuyPrice(ticker)));
    const sales = trades.filter((t) => t.trade_type === 'SELL');
    sales.forEach((sell) => {
      const tk = sell.ticker;
      if (!tk) return;
      const avgPrice = avgPrices[tk] || 0;
      const sellAmount = sell.price_per_share * sell.quantity;
      const buyCost = avgPrice * sell.quantity;
      profit += sellAmount - buyCost;
    });
    return profit;
  };

  const profitBySoldTicker = () => {
    const result = {};
    const avgPrices = {};
    tickers.forEach((ticker) => (avgPrices[ticker] = avgBuyPrice(ticker)));

    const sales = trades.filter((t) => t.trade_type === 'SELL');

    sales.forEach((sell) => {
      const tk = sell.ticker;
      if (!tk) return;
      const sellAmount = sell.price_per_share * sell.quantity;
      const buyCost = (avgPrices[tk] || 0) * sell.quantity;
      if (!result[tk]) result[tk] = 0;
      result[tk] += sellAmount - buyCost;
    });
    return result;
  };

  const soldTickers = () => {
    const sells = trades.filter((t) => t.trade_type === 'SELL');
    const unique = [...new Set(sells.map((s) => s.ticker).filter((t) => t !== '—'))];
    return unique;
  };

  const dividendTickers = () => {
    const unique = [...new Set(dividends.map((d) => d.ticker).filter((t) => t !== '—'))];
    return unique;
  };

  const handleActualPriceChange = (ticker, value) => {
    setActualPrices((prev) => ({
      ...prev,
      [ticker]: Number(value),
    }));
  };

  const profitByTicker = profitBySoldTicker();

  return (
    <Box sx={{ padding: 4, maxWidth: 900, margin: '0 auto' }}>
      <Typography variant="h4" gutterBottom>
        Отчет по портфелю
      </Typography>

      {/* Фильтры */}
      <Box sx={{ display: 'flex', gap: 3, mb: 3, flexWrap: 'wrap' }}>
        <TextField
          label="С даты"
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          InputLabelProps={{ shrink: true }}
          sx={{ minWidth: 150 }}
        />
        <TextField
          label="По дату"
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          InputLabelProps={{ shrink: true }}
          sx={{ minWidth: 150 }}
        />
        <FormControl sx={{ minWidth: 150 }}>
          <InputLabel id="ticker-label">Тикер</InputLabel>
          <Select
            labelId="ticker-label"
            value={selectedTicker}
            label="Тикер"
            onChange={(e) => setSelectedTicker(e.target.value)}
          >
            <MenuItem value="">
              <em>Все</em>
            </MenuItem>
            {tickers.map((t) => (
              <MenuItem key={t} value={t}>
                {t}
              </MenuItem>
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
          <Table>
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
              {tickers.map((ticker) => {
                const buys = trades.filter((t) => t.trade_type === 'BUY' && t.ticker === ticker);
                const totalQtyBought = buys.reduce((sum, t) => sum + t.quantity, 0);
                const sells = trades.filter((t) => t.trade_type === 'SELL' && t.ticker === ticker);
                const totalQtySold = sells.reduce((sum, t) => sum + t.quantity, 0);
                const qtyOnHand = totalQtyBought - totalQtySold;
                if (qtyOnHand <= 0) return null;

                const avgPrice = avgBuyPrice(ticker);
                const actualPrice = actualPrices[ticker] || avgPrice;
                const value = qtyOnHand * actualPrice;

                // Валюта берём из stocksMap
                const currency = stocksMap[buys[0]?.stock_id]?.currency || trades.find(t => t.ticker === ticker)?.currency || '';

                return (
                  <TableRow key={ticker}>
                    <TableCell>{ticker}</TableCell>
                    <TableCell align="right">{formatCurrency(avgPrice, currency)}</TableCell>
                    <TableCell align="right">
                      <TextField
                        variant="standard"
                        type="number"
                        inputProps={{ step: '0.01' }}
                        value={actualPrices[ticker] ?? ''}
                        onChange={(e) => handleActualPriceChange(ticker, e.target.value)}
                        sx={{ width: 80 }}
                      />
                    </TableCell>
                    <TableCell align="right">{qtyOnHand.toLocaleString('ru-RU')}</TableCell>
                    <TableCell align="right">{formatCurrency(value, currency)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Paper>
      )}

      <Box sx={{ mt: 4 }}>
        <Typography variant="h6" gutterBottom>
          Итоги
        </Typography>

        <Typography>
          <strong>Общая стоимость портфеля (по средней цене покупки):</strong>
        </Typography>
        {Object.entries(portfolioValueByAvgPrice()).map(([currency, amount]) => (
          <Typography key={currency} sx={{ ml: 2 }}>
            {amount.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {currency}
          </Typography>
        ))}

        <Typography sx={{ mt: 2 }}>
          <strong>Общая стоимость портфеля (по актуальной цене):</strong>
        </Typography>
        {Object.entries(portfolioValueByActualPrice()).map(([currency, amount]) => (
          <Typography key={currency} sx={{ ml: 2 }}>
            {amount.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {currency}
          </Typography>
        ))}

        <Typography
          sx={{
            color: portfolioValueByActualPrice().reduce?.((acc, cur) => acc + cur, 0) - portfolioValueByAvgPrice().reduce?.((acc, cur) => acc + cur, 0) >= 0
              ? 'green'
              : 'red',
            fontWeight: 'bold',
          }}
        >
          <strong>Прибыль/Убыток по портфелю:</strong>{' '}
          {(
            Object.values(portfolioValueByActualPrice()).reduce((acc, cur) => acc + cur, 0) -
            Object.values(portfolioValueByAvgPrice()).reduce((acc, cur) => acc + cur, 0)
          ).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </Typography>

        <Typography>
          <strong>Сумма дивидендов:</strong> {totalDividends().toFixed(2)}
        </Typography>
        <Typography
          sx={{
            color: totalProfit() >= 0 ? 'green' : 'red',
            fontWeight: 'bold',
          }}
        >
          <strong>Прибыль/Убыток с продаж:</strong> {totalProfit().toFixed(2)}
        </Typography>

        <Box sx={{ mt: 2 }}>
          <Typography variant="subtitle1" gutterBottom>
            <strong>Проданные акции:</strong>{' '}
            {soldTickers().length > 0 ? (
              soldTickers().map((ticker) => {
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
                    {ticker} {isProfit ? <ArrowUpwardIcon fontSize="small" /> : <ArrowDownwardIcon fontSize="small" />}
                  </Box>
                );
              })
            ) : (
              'нет'
            )}
          </Typography>

          <Typography variant="subtitle1">
            <strong>Акции с дивидендами:</strong> {dividendTickers().length > 0 ? dividendTickers().join(', ') : 'нет'}
          </Typography>
        </Box>
      </Box>
    </Box>
  );
}
