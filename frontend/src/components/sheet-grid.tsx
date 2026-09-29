import React, { useState } from "react";
import { Dimensions, NativeSyntheticEvent, NativeScrollEvent, ScrollView, StyleSheet, TouchableOpacity, View } from "react-native";
import { AppText } from "@/src/components/app-text";
import { ChartView } from "@/src/components/chart-view";
import { Sheet } from "@/src/storage/db";
import { useTheme } from "@/src/theme";

const CELL_W = 90;
const CELL_H = 34;
const ROW_HEADER_W = 44;

type Selection = { row: number; col: number };

type SheetGridProps = {
  sheet: Sheet;
  selection: Selection;
  onSelect: (selection: Selection) => void;
  displayValue: (row: number, col: number) => string;
};

export function SheetGrid({ sheet, selection, onSelect, displayValue }: SheetGridProps) {
  const { colors } = useTheme();
  const viewportWidth = Math.max(240, Dimensions.get("window").width - 32);
  const viewportHeight = Math.max(260, Dimensions.get("window").height - 330);
  const visibleRows = Math.min(sheet.rows, Math.ceil(viewportHeight / CELL_H) + 4);
  const visibleCols = Math.min(sheet.cols, Math.ceil((viewportWidth - ROW_HEADER_W) / CELL_W) + 3);
  const [rowStart, setRowStart] = useState(0);
  const [colStart, setColStart] = useState(0);

  const onVerticalScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = Math.min(Math.max(0, sheet.rows - visibleRows), Math.max(0, Math.floor(event.nativeEvent.contentOffset.y / CELL_H) - 2));
    if (next !== rowStart) setRowStart(next);
  };

  const onHorizontalScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = Math.min(Math.max(0, sheet.cols - visibleCols), Math.max(0, Math.floor(event.nativeEvent.contentOffset.x / CELL_W) - 2));
    if (next !== colStart) setColStart(next);
  };

  const columnStartSpacer = <View style={{ width: colStart * CELL_W }} />;
  const columnEndSpacer = <View style={{ width: Math.max(0, (sheet.cols - colStart - visibleCols) * CELL_W) }} />;

  return (
    <View style={styles.container}>
      <ScrollView horizontal keyboardShouldPersistTaps="handled" showsHorizontalScrollIndicator onScroll={onHorizontalScroll} scrollEventThrottle={64}>
        <View style={{ width: ROW_HEADER_W + sheet.cols * CELL_W }}>
          <View style={styles.row}>
            <View style={[styles.rowHeader, { width: ROW_HEADER_W, height: CELL_H, backgroundColor: colors.surfaceTertiary, borderColor: colors.border }]} />
            {columnStartSpacer}
            {Array.from({ length: visibleCols }, (_, index) => {
              const col = colStart + index;
              return <View key={col} style={[styles.colHeader, { width: CELL_W, height: CELL_H, backgroundColor: colors.surfaceTertiary, borderColor: colors.border }]}><AppText variant="caption">{colToLetter(col)}</AppText></View>;
            })}
            {columnEndSpacer}
          </View>
          <ScrollView
            style={{ height: viewportHeight }}
            nestedScrollEnabled
            showsVerticalScrollIndicator
            keyboardShouldPersistTaps="handled"
            onScroll={onVerticalScroll}
            scrollEventThrottle={64}
          >
            <View style={{ height: sheet.rows * CELL_H }}>
              <View style={{ height: rowStart * CELL_H }} />
              {Array.from({ length: Math.min(visibleRows, sheet.rows - rowStart) }, (_, rowOffset) => {
                const row = rowStart + rowOffset;
                return (
                  <View key={row} style={styles.row}>
                    <View style={[styles.rowHeader, { width: ROW_HEADER_W, height: CELL_H, backgroundColor: colors.surfaceTertiary, borderColor: colors.border }]}><AppText variant="caption">{row + 1}</AppText></View>
                    {columnStartSpacer}
                    {Array.from({ length: Math.min(visibleCols, sheet.cols - colStart) }, (_, colOffset) => {
                      const col = colStart + colOffset;
                      const key = `${colToLetter(col)}${row + 1}`;
                      const cell = sheet.cells[key];
                      const style = cell?.style || {};
                      const selected = selection.row === row && selection.col === col;
                      return (
                        <TouchableOpacity
                          key={key}
                          testID={`cell-${key}`}
                          onPress={() => onSelect({ row, col })}
                          style={[styles.cell, { width: CELL_W, height: CELL_H, backgroundColor: style.bg || (selected ? colors.brandTertiary : colors.surfaceSecondary), borderColor: selected ? colors.brandPrimary : colors.border, borderWidth: selected ? 2 : 0.5 }]}
                        >
                          <AppText numberOfLines={1} style={{ color: style.color || colors.onSurface, fontWeight: style.bold ? "700" : "400", fontStyle: style.italic ? "italic" : "normal", textAlign: style.align || (typeof cell?.v === "number" ? "right" : "left"), fontSize: 13, paddingHorizontal: 6 }}>{displayValue(row, col)}</AppText>
                        </TouchableOpacity>
                      );
                    })}
                    {columnEndSpacer}
                  </View>
                );
              })}
              <View style={{ height: Math.max(0, (sheet.rows - rowStart - visibleRows) * CELL_H) }} />
            </View>
          </ScrollView>
        </View>
      </ScrollView>
      {(sheet.charts || []).map((chart) => <View key={chart.id} style={styles.chart}><ChartView chart={chart} sheet={sheet} /></View>)}
    </View>
  );
}

function colToLetter(col: number): string {
  let value = col + 1;
  let result = "";
  while (value > 0) {
    const remainder = (value - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    value = Math.floor((value - 1) / 26);
  }
  return result;
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  row: { flexDirection: "row" },
  rowHeader: { alignItems: "center", justifyContent: "center", borderWidth: 0.5 },
  colHeader: { alignItems: "center", justifyContent: "center", borderWidth: 0.5 },
  cell: { alignItems: "stretch", justifyContent: "center" },
  chart: { padding: 12 },
});
