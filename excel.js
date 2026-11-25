"use strict";

async function makeExpenseWorkbook(rows) {
  const spreadsheet = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
  const references = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
  const relationships = "http://schemas.openxmlformats.org/package/2006/relationships";
  const xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  const zip = new JSZip();
  const add = (path, content) => zip.file(path, xml + content);

  add("[Content_Types].xml", `
    <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
      <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
      <Default Extension="xml" ContentType="application/xml"/>
      <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
      <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
      <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
    </Types>`);
  add("_rels/.rels", `
    <Relationships xmlns="${relationships}">
      <Relationship Id="rId1" Type="${references}/officeDocument" Target="xl/workbook.xml"/>
    </Relationships>`);
  add("xl/workbook.xml", `
    <workbook xmlns="${spreadsheet}" xmlns:r="${references}">
      <sheets><sheet name="출장여비" sheetId="1" r:id="rId1"/></sheets>
    </workbook>`);
  add("xl/_rels/workbook.xml.rels", `
    <Relationships xmlns="${relationships}">
      <Relationship Id="rId1" Type="${references}/worksheet" Target="worksheets/sheet1.xml"/>
      <Relationship Id="rId2" Type="${references}/styles" Target="styles.xml"/>
    </Relationships>`);
  add("xl/styles.xml", `
    <styleSheet xmlns="${spreadsheet}">
      <fonts count="2">
        <font><sz val="11"/><name val="맑은 고딕"/></font>
        <font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="맑은 고딕"/></font>
      </fonts>
      <fills count="3">
        <fill><patternFill patternType="none"/></fill>
        <fill><patternFill patternType="gray125"/></fill>
        <fill><patternFill patternType="solid"><fgColor rgb="FF142B46"/></patternFill></fill>
      </fills>
      <borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
      <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
      <cellXfs count="3">
        <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
        <xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
        <xf numFmtId="3" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
      </cellXfs>
      <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
    </styleSheet>`);

  const sheetRows = rows.map(({ values, heading = false, moneyColumn = false }, index) => {
    const number = index + 1;
    const cells = values.map((value, column) => {
      const address = "ABC"[column] + number;
      if (typeof value === "number") {
        const style = moneyColumn && column === 1 ? ' s="2"' : "";
        return `<c r="${address}"${style}><v>${value}</v></c>`;
      }
      const escaped = value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
      const style = heading ? ' s="1"' : "";
      return `<c r="${address}"${style} t="inlineStr"><is><t xml:space="preserve">${escaped}</t></is></c>`;
    });
    return `<row r="${number}">${cells.join("")}</row>`;
  });
  add("xl/worksheets/sheet1.xml", `
    <worksheet xmlns="${spreadsheet}">
      <sheetFormatPr defaultRowHeight="19"/>
      <cols>
        <col min="1" max="1" width="29" customWidth="1"/>
        <col min="2" max="2" width="21" customWidth="1"/>
        <col min="3" max="3" width="64" customWidth="1"/>
      </cols>
      <sheetData>${sheetRows.join("")}</sheetData>
    </worksheet>`);
  return zip.generateAsync({
    type: "blob",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}
