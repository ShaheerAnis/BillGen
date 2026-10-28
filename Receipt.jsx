import React, { useRef, useState } from "react";
import { useReactToPrint } from "react-to-print";

/**
 * Receipt Component for SAIM Medical Store
 * Designed for 80mm / 300px thermal receipt printers.
 */
export const Receipt = React.forwardRef(({
  store = {
    name: "SAIM MEDICAL STORE",
    address: "Bilal Town, Kakul Road, Abbottabad.",
    dslNo: "AD/RS/296",
    ntnNo: "3930432",
    cellNo: "0336-5677108",
  },
  bill = {
    paymentId: "AD-142677",
    billNo: "86431",
    date: "16/03/2025 2:33:42 PM",
    user: "Shaheer",
    counter: "01",
  },
  items = [
    { name: "GETRYL 2MG", quantity: 30, price: 6.86, total: 205.96 },
    { name: "CONCOR 5MG", quantity: 28, price: 22.92, total: 641.76 },
    { name: "XENGLU-MET 12.5/500MG", quantity: 28, price: 32.14, total: 900.00 },
    { name: "XULTOPHY (100/3.6) INJ 3ML", quantity: 1, price: 10148.00, total: 10148.00 },
  ],
  total,
  discount = 0,
  netTotal,
  cashReceived = 12000,
  balance = 104.28,
  footerNotes = {
    policy: "No Return or Exchange After 3 Days. Fridge Items Cannot Be Returned or Exchanged.",
    greeting: "Thank You For Visiting Us.",
    software: "Software By Heath-Tech Cell # 0311-5505115",
  }
}, ref) => {
  const calculatedTotal = total ?? items.reduce((acc, item) => acc + (item.total || item.quantity * item.price), 0);
  const calculatedNet = netTotal ?? (calculatedTotal - discount);
  const calculatedBalance = balance ?? (cashReceived - calculatedNet);

  return (
    <div
      ref={ref}
      className="receipt-container"
      style={{
        width: "300px",
        padding: "12px",
        border: "1px solid #111",
        backgroundColor: "#ffffff",
        color: "#000000",
        fontFamily: "'Courier New', Courier, monospace, system-ui",
        fontSize: "12px",
        lineHeight: "1.35",
        textAlign: "left",
        margin: "0 auto",
        boxSizing: "border-box"
      }}
    >
      <h2 style={{ textAlign: "center", margin: "4px 0", fontSize: "17px", fontWeight: "bold", letterSpacing: "0.5px" }}>
        {store.name}
      </h2>
      <p style={{ textAlign: "center", margin: "3px 0", fontSize: "11px" }}>{store.address}</p>
      <p style={{ textAlign: "center", margin: "3px 0", fontSize: "11px" }}>
        DSL NO: {store.dslNo} &nbsp;&nbsp; NTN NO: {store.ntnNo}
      </p>
      <p style={{ textAlign: "center", margin: "3px 0", fontSize: "11px" }}>Cell NO: {store.cellNo}</p>
      
      <hr style={{ border: "none", borderTop: "1px dashed #444", margin: "6px 0" }} />

      {/* Sales Receipt Banner */}
      <div
        style={{
          backgroundColor: "#000000",
          color: "#ffffff",
          textAlign: "center",
          printColorAdjust: "exact",
          WebkitPrintColorAdjust: "exact",
          padding: "4px 2px",
          marginTop: "4px",
          marginBottom: "6px",
          fontWeight: "bold",
          fontSize: "12px",
          letterSpacing: "1px"
        }}
      >
        SALES RECEIPT
      </div>

      <div style={{ fontSize: "11px", margin: "2px 0" }}>
        <p style={{ margin: "2px 0" }}><strong>Bill Payment ID:</strong> {bill.paymentId}</p>
        <p style={{ margin: "2px 0" }}><strong>Bill #:</strong> {bill.billNo}</p>
        <p style={{ margin: "2px 0" }}><strong>Date:</strong> {bill.date}</p>
        <p style={{ margin: "2px 0" }}><strong>User:</strong> {bill.user} &nbsp;&nbsp; <strong>Counter:</strong> {bill.counter}</p>
      </div>

      <hr style={{ border: "none", borderTop: "1px dashed #444", margin: "6px 0" }} />

      <table style={{ width: "100%", textAlign: "left", borderCollapse: "collapse", fontSize: "11px" }}>
        <thead>
          <tr style={{ borderBottom: "1px solid #000" }}>
            <th style={{ textAlign: "left", width: "40%", padding: "2px 0" }}>Item</th>
            <th style={{ textAlign: "center", width: "15%", padding: "2px 0" }}>Qty</th>
            <th style={{ textAlign: "right", width: "20%", padding: "2px 0" }}>Price</th>
            <th style={{ textAlign: "right", width: "25%", padding: "2px 0" }}>Amount</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => (
            <tr key={index} style={{ borderBottom: "1px dotted #ccc" }}>
              <td style={{ padding: "3px 0", wordBreak: "break-word" }}>{item.name}</td>
              <td style={{ textAlign: "center", padding: "3px 0" }}>{item.quantity}</td>
              <td style={{ textAlign: "right", padding: "3px 0" }}>{Number(item.price).toFixed(2)}</td>
              <td style={{ textAlign: "right", padding: "3px 0" }}>{(item.total !== undefined ? item.total : item.quantity * item.price).toFixed(2)}</td>
            </tr>
          ))}
          {/* Total Items Row Below the Items */}
          <tr style={{ borderTop: "1px solid #000" }}>
            <td colSpan={3} style={{ padding: "4px 0" }}>
              <strong>Total Items:&nbsp;&nbsp;</strong> {items.length}
            </td>
            <td style={{ textAlign: "right", padding: "4px 0", fontWeight: "bold" }}>
              {calculatedTotal.toFixed(2)}
            </td>
          </tr>
        </tbody>
      </table>

      <hr style={{ border: "none", borderTop: "1px dashed #444", margin: "6px 0" }} />

      {/* Summary Table with Right Alignment Under Amount */}
      <table style={{ width: "100%", textAlign: "right", borderCollapse: "collapse", fontSize: "11px" }}>
        <tbody>
          <tr>
            <td style={{ textAlign: "left", padding: "2px 0" }}><strong>Disc:</strong></td>
            <td style={{ padding: "2px 0" }}>{Number(discount).toFixed(2)}</td>
          </tr>
          <tr>
            <td style={{ textAlign: "left", padding: "2px 0" }}><strong>Gross Total:</strong></td>
            <td style={{ padding: "2px 0", fontWeight: "bold", fontSize: "12px" }}>
              {calculatedNet.toFixed(2)}
            </td>
          </tr>
          <tr>
            <td style={{ textAlign: "left", padding: "2px 0" }}><strong>Cash Received:</strong></td>
            <td style={{ padding: "2px 0" }}>{Number(cashReceived).toFixed(2)}</td>
          </tr>
          <tr>
            <td style={{ textAlign: "left", padding: "2px 0" }}><strong>Balance:</strong></td>
            <td style={{ padding: "2px 0", fontWeight: "bold" }}>{calculatedBalance.toFixed(2)}</td>
          </tr>
        </tbody>
      </table>

      <hr style={{ border: "none", borderTop: "1px dashed #444", margin: "6px 0" }} />

      <p style={{ textAlign: "center", fontSize: "10px", margin: "4px 0", lineHeight: "1.3" }}>
        {footerNotes.policy}
      </p>
      <p style={{ textAlign: "center", fontSize: "11px", fontWeight: "bold", margin: "4px 0" }}>
        {footerNotes.greeting}
      </p>
      <p style={{ textAlign: "center", fontSize: "10px", margin: "4px 0", color: "#333" }}>
        {footerNotes.software}
      </p>
    </div>
  );
});

export const PrintButton = ({ receiptRef }) => {
  const handlePrint = useReactToPrint({
    content: () => receiptRef.current,
    documentTitle: "Pharmacy_Receipt",
  });

  return (
    <button
      style={{
        width: "100%",
        maxWidth: "300px",
        padding: "12px 18px",
        marginTop: "12px",
        backgroundColor: "#2563eb",
        color: "white",
        border: "none",
        borderRadius: "6px",
        fontSize: "14px",
        fontWeight: "600",
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "8px",
        boxShadow: "0 2px 4px rgba(37, 99, 235, 0.2)",
        transition: "all 0.2s ease"
      }}
      onClick={handlePrint}
    >
      🖨️ Print Receipt
    </button>
  );
};

export default function ReceiptPage() {
  const receiptRef = useRef();
  const [items] = useState([
    { name: "GETRYL 2MG", quantity: 30, price: 6.86, total: 205.96 },
    { name: "CONCOR 5MG", quantity: 28, price: 22.92, total: 641.76 },
    { name: "XENGLU-MET 12.5/500MG", quantity: 28, price: 32.14, total: 900.00 },
    { name: "XULTOPHY (100/3.6) INJ 3ML", quantity: 1, price: 10148.00, total: 10148.00 },
  ]);

  const total = items.reduce((acc, item) => acc + item.total, 0);
  const discount = 0;
  const netTotal = total - discount;

  return (
    <div style={{ textAlign: "center", padding: "24px", minHeight: "100vh", backgroundColor: "#f3f4f6" }}>
      <Receipt ref={receiptRef} items={items} total={total} discount={discount} netTotal={netTotal} />
      <PrintButton receiptRef={receiptRef} />
    </div>
  );
}
