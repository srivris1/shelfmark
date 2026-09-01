import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CopiesMeter, StatusTag, cx, loanStatusKind } from './ui'
import { QrScannerPanel } from './QrScannerPanel'


const scanImage = vi.fn()
vi.mock('qr-scanner', () => ({ default: { scanImage: (...args: unknown[]) => scanImage(...args) } }))

describe('cx', () => {
  it("lets a caller's classes override the component defaults", () => {
    expect(cx('h-10 w-full px-3', 'h-9 w-auto')).toBe('px-3 h-9 w-auto')
    expect(cx('a', false, null, undefined, 'b')).toBe('a b')
  })
})

describe('status display', () => {
  it('always pairs the colour with a word', () => {
    render(<StatusTag status="overdue" />)
    expect(screen.getByText(/overdue/i)).toBeInTheDocument()
  })

  it('maps a transaction to the tag it should show', () => {
    expect(loanStatusKind({ status: 'issued', daysOverdue: 0 })).toBe('on-loan')
    expect(loanStatusKind({ status: 'returned', daysOverdue: 3 })).toBe('returned-late')
    expect(loanStatusKind({ status: 'returned', daysOverdue: 0 })).toBe('returned')
    expect(loanStatusKind({ status: 'overdue', daysOverdue: 2 })).toBe('overdue')
  })

  it('describes the copies meter for screen readers', () => {
    render(<CopiesMeter available={1} total={3} />)
    expect(screen.getByLabelText('1 of 3 copies on the shelf')).toBeInTheDocument()
  })
})

describe('scanner panel fallbacks', () => {
  it('submits a typed Book ID with Enter and clears the box', async () => {
    const onCode = vi.fn()
    render(<QrScannerPanel onCode={onCode} />)
    const box = screen.getByLabelText('Book ID or ISBN')
    await userEvent.type(box, '  9780132350884 {Enter}')
    expect(onCode).toHaveBeenCalledWith('9780132350884', 'manual')
    expect(box).toHaveValue('')
  })

  it('reads a QR code from an uploaded photo', async () => {
    scanImage.mockResolvedValueOnce({ data: 'SHELFMARK:1:abc:def' })
    const onCode = vi.fn()
    const { container } = render(<QrScannerPanel onCode={onCode} />)
    await userEvent.upload(container.querySelector('input[type=file]')!, new File(['x'], 'label.png', { type: 'image/png' }))
    expect(onCode).toHaveBeenCalledWith('SHELFMARK:1:abc:def', 'upload')
  })

  it('explains when a photo has no QR code in it', async () => {
    scanImage.mockRejectedValueOnce(new Error('No QR code found'))
    const { container } = render(<QrScannerPanel onCode={vi.fn()} />)
    await userEvent.upload(container.querySelector('input[type=file]')!, new File(['x'], 'blurry.png', { type: 'image/png' }))
    expect(await screen.findByText(/couldn't find a qr code/i)).toBeInTheDocument()
  })

  it('stays locked until the borrower is filled in', () => {
    render(<QrScannerPanel onCode={vi.fn()} disabled disabledReason="Enter the borrower first." />)
    expect(screen.getByLabelText('Book ID or ISBN')).toBeDisabled()
    expect(screen.getByText('Enter the borrower first.')).toBeInTheDocument()
  })
})
