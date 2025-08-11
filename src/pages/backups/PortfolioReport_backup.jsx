import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import {
  Box,
  Typography,
  CircularProgress,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Button,
} from '@mui/material';

export default function PortfolioReport() {
  const [report, setReport] = useState({});
  const [loading, setLoading] = useState(false);
  const [tickerFilter, setTickerFilter] = useState('');
  const [tickers, setTickers] = useState([]);
  const [currentPrices, setCurrentPrices] = useState({}); // { ticker: price }

  useEffect(() => {
    async function fetchReport() {
      setLoading(true);

      // Получаем все тикеры для фильтра
      const { data: stocksData, error: stocksError } = await supabase
        .from('stocks')
        .select(`
          stock_id,
          ticker,
          exchanges:exchange_id (
            exchange_id,
            name,
            currency_id,
            currencies:currency_id (
              code
            )
          )
        `);

      if (stocksError) {
        console.error(stocksError);
        setLoading(false);
        return;
      }

      const stockMap = {};
      stocksData.forEach(stock => {
        stockMap[stock.stock_id] = {
          ticker: stock.ticker,
          currency: stock.exchanges?.currencies?.code || 'KZT',
        };
      });

      setTickers([...new Set(stocksData.map(s => s.ticker))].sort());

      // Получаем сделки покупки
      const { data: buys, error: buysError } = await supabase
        .from('trades')
        .select('*')
        .eq('trade_type', 'BUY');

      if (buysError) {
        console.error(buysError);
        setLoading(false);
        return;
      }

      // Продажи
      const { data: sells, error: sellsError } = await supabase
        .from('trades')
        .select('*')
        .eq('trade_type', 'SELL');

      if (sellsError) {
        console.error(sellsError);
        setLoading(false);
        return;
      }

      // Дивиденды
      const { data: dividends, error: divError } = await supabase
        .from('dividends')
        .select(`
          *,
          stocks:stock_id (
            ticker,
            exchanges:exchange_id (
              currencies:currency_id (code)
            )
          )
        `);

      if (divError) {
        console.error(divError);
        setLoading(false);
        return;
      }

      const positions = {};

      buys.forEach(trade => {
        const { stock_id, price_per_share, quantity } = trade;
        const stock = stockMap[stock_id];
        if (!stock) return;
        const { ticker, currency } = stock;

        if (!positions[ticker]) positions[ticker] = {};
        if (!positions[ticker][currency])
          positions[ticker][currency] = {
            boughtQty: 0,
            boughtSum: 0,
            soldQty: 0,
            dividends: 0,
          };

        positions[ticker][currency].boughtQty += quantity;
        positions[ticker][currency].boughtSum += price_per_share * quantity;
      });

      sells.forEach(trade => {
        const { stock_id, quantity } = trade;
        const stock = stockMap[stock_id];
        if (!stock) return;
        const { ticker, currency } = stock;

        if (!positions[ticker]) positions[ticker] = {};
        if (!positions[ticker][currency])
          positions[ticker][currency] = {
            boughtQty: 0,
            boughtSum: 0,
            soldQty: 0,
            dividends: 0,
          };

        positions[ticker][currency].soldQty += quantity;
      });

      dividends.forEach(div => {
        const stock = div.stocks;
        if (!stock) return;
        const ticker = stock.ticker;
        const currency = stock.exchanges?.currencies?.code || 'KZT';

        if (!positions[ticker]) positions[ticker] = {};
        if (!positions[ticker][currency])
          positions[ticker][currency] = {
            boughtQty: 0,
            boughtSum: 0,
            soldQty: 0,
            dividends: 0,
          };

        positions[ticker][currency].dividends += div.total_amount;
      });

      setReport(positions);
      setLoading(false);
    }

    fetchReport();
  }, []);

  const formatNumber = num => num.toLocaleString('ru-RU', { maximumFractionDigits: 2 });

  const handleCurrentPriceChange = (ticker, value) => {
    setCurrentPrices(prev => ({
      ...prev,
      [ticker]: value === '' ? '' : Number(value),
    }));
  };

  // Фильтрация по тикеру
  const filteredTickers = tickerFilter ? [tickerFilter] : Object.keys(report).sort();

  // Подсчёт общей стоимости и профита по всему портфелю
  let totalPortfolioValue = 0;
  let totalProfit = 0;

  return (
    <Box sx={{ p: 2 }}>
      <Typography variant="h5" gutterBottom>
        Отчет по портфелю
      </Typography>

      <FormControl sx={{ minWidth: 200, mb: 2 }}>
        <InputLabel>Фильтр по тикеру</InputLabel>
        <Select
          value={tickerFilter}
          label="Фильтр по тикеру"
          onChange={e => setTickerFilter(e.target.value)}
        >
          <MenuItem value="">
            <em>Все тикеры</em>
          </MenuItem>
          {tickers.map(t => (
            <MenuItem key={t} value={t}>
              {t}
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      {loading && <CircularProgress />}

      {!loading &&
        (filteredTickers.length === 0 ? (
          <Typography>Нет данных для отображения.</Typography>
        ) : (
          filteredTickers.map(ticker => {
            const currencies = report[ticker];
            if (!currencies) return null;

            return (
              <Box key={ticker} sx={{ mb: 5 }}>
                <Typography variant="h6">{ticker}</Typography>
                <TextField
                  label="Актуальная цена"
                  value={currentPrices[ticker] ?? ''}
                  onChange={e => handleCurrentPriceChange(ticker, e.target.value)}
                  type="number"
                  inputProps={{ step: '0.0001', min: 0 }}
                  sx={{ mb: 2, width: 150 }}
                />

                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell>Валюта</TableCell>
                      <TableCell>Средняя цена покупки</TableCell>
                      <TableCell>Куплено (кол-во)</TableCell>
                      <TableCell>Продано (кол-во)</TableCell>
                      <TableCell>Дивиденды</TableCell>
                      <TableCell>Текущая стоимость</TableCell>
                      <TableCell>Профит</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {Object.entries(currencies).map(([currency, data]) => {
                      const avgPrice = data.boughtQty ? data.boughtSum / data.boughtQty : 0;
                      const netQty = data.boughtQty - data.soldQty;
                      const portfolioValue = avgPrice * netQty;
                      const currentPrice = currentPrices[ticker] ?? avgPrice;
                      const currentValue = currentPrice * netQty;
                      const profit = currentValue - portfolioValue + data.dividends;

                      totalPortfolioValue += currentValue;
                      totalProfit += profit;

                      return (
                        <TableRow key={currency}>
                          <TableCell>{currency}</TableCell>
                          <TableCell>
                            {formatNumber(avgPrice)} {currency}
                          </TableCell>
                          <TableCell>{formatNumber(data.boughtQty)}</TableCell>
                          <TableCell>{formatNumber(data.soldQty)}</TableCell>
                          <TableCell>
                            {formatNumber(data.dividends)} {currency}
                          </TableCell>
                          <TableCell>
                            {formatNumber(currentValue)} {currency}
                          </TableCell>
                          <TableCell
                            sx={{ color: profit >= 0 ? 'green' : 'red' }}
                          >
                            {formatNumber(profit)} {currency}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </Box>
            );
          })
        ))}

      {!loading && Object.keys(report).length > 0 && (
        <Box sx={{ mt: 4 }}>
          <Typography variant="h6">Итого по портфелю</Typography>
          <Typography>
            Общая текущая стоимость:{' '}
            <b>{formatNumber(totalPortfolioValue)}</b>
          </Typography>
          <Typography
            sx={{ color: totalProfit >= 0 ? 'green' : 'red' }}
          >
            Общий профит: <b>{formatNumber(totalProfit)}</b>
          </Typography>
        </Box>
      )}
    </Box>
  );
}
