<?php
/**
 * Copyright (c) Falcon Media (info@falconmedia.nl)
 *
 * @author Falcon Media
 */

declare(strict_types=1);

namespace Innosend\PickupPoints\Plugin\Sales\Model\Order\Pdf;

use Innosend\PickupPoints\Helper\ShippingInformation;
use Magento\Framework\App\ResourceConnection;
use Magento\Sales\Model\Order\Pdf\Invoice as PdfInvoice;
use Psr\Log\LoggerInterface;

/**
 * Plugin to add pickup point information to Invoice PDF documents
 */
class InvoicePlugin
{
    /**
     * @var ResourceConnection
     */
    private $resourceConnection;

    /**
     * @var ShippingInformation
     */
    private $shippingInformation;

    /**
     * @var LoggerInterface
     */
    private $logger;

    /**
     * @param ResourceConnection $resourceConnection
     * @param ShippingInformation $shippingInformation
     * @param LoggerInterface $logger
     */
    public function __construct(
        ResourceConnection $resourceConnection,
        ShippingInformation $shippingInformation,
        LoggerInterface $logger
    ) {
        $this->resourceConnection = $resourceConnection;
        $this->shippingInformation = $shippingInformation;
        $this->logger = $logger;
    }

    /**
     * Add pickup point information to invoice PDF
     *
     * @param PdfInvoice $subject
     * @param \Zend_Pdf $pdf
     * @param array $invoices
     * @return \Zend_Pdf
     */
    public function afterGetPdf(PdfInvoice $subject, $pdf, $invoices = [])
    {
        $this->logger->info('Innosend Pickup Points: InvoicePlugin afterGetPdf called', [
            'invoice_count' => count($invoices),
        ]);

        try {
            // Get all pages in the PDF
            $pages = $pdf->pages;
            
            if (empty($pages)) {
                $this->logger->warning('Innosend Pickup Points: No pages in PDF');
                return $pdf;
            }

            if (empty($invoices)) {
                $this->logger->warning('Innosend Pickup Points: No invoices provided');
                return $pdf;
            }

            $pageIndex = 0;
            foreach ($invoices as $invoice) {
                if ($pageIndex >= count($pages)) {
                    break;
                }

                $order = $invoice->getOrder();
                $shippingMethod = $order->getShippingMethod();

                $this->logger->info('Innosend Pickup Points: Processing invoice', [
                    'invoice_id' => $invoice->getId(),
                    'order_id' => $order->getId(),
                    'shipping_method' => $shippingMethod,
                ]);

                // Check if shipping method is pickup points
                if ($shippingMethod && preg_match('/^innosend_pickup_points/', $shippingMethod)) {
                    $this->logger->info('Innosend Pickup Points: Is pickup points method');

                    // Get pickup point data
                    $pickupPointData = $this->getPickupPointData((int)$order->getId());
                    
                    if ($pickupPointData) {
                        $this->logger->info('Innosend Pickup Points: Adding to PDF page', [
                            'page_index' => $pageIndex,
                            'data' => $pickupPointData,
                        ]);

                        // Add to current page
                        $this->addPickupPointToPdf($subject, $pages[$pageIndex], $pickupPointData);
                    } else {
                        $this->logger->warning('Innosend Pickup Points: No pickup point data found');
                    }
                }

                $pageIndex++;
            }

        } catch (\Exception $e) {
            $this->logger->error('Innosend Pickup Points: Exception in InvoicePlugin', [
                'error' => $e->getMessage(),
                'trace' => $e->getTraceAsString(),
            ]);
        }

        return $pdf;
    }

    /**
     * Get pickup point data from database
     *
     * @param int $orderId
     * @return array|null
     */
    private function getPickupPointData(int $orderId): ?array
    {
        try {
            $connection = $this->resourceConnection->getConnection();
            $tableName = $this->resourceConnection->getTableName('fm_innosend_order');

            if (!$connection->isTableExists($tableName)) {
                return null;
            }

            $select = $connection->select()
                ->from($tableName, 'shipping_information')
                ->where('order_id = ?', $orderId);
            $shippingInformationJson = $connection->fetchOne($select);

            if ($shippingInformationJson) {
                $shippingInformation = $this->shippingInformation->parseShippingInformation($shippingInformationJson);
                return $this->shippingInformation->extractPickupPoint($shippingInformation);
            }
        } catch (\Exception $e) {
            $this->logger->error('Innosend Pickup Points: Failed to load pickup point data for PDF', [
                'order_id' => $orderId,
                'error' => $e->getMessage(),
            ]);
        }

        return null;
    }

    /**
     * Add pickup point information to PDF page
     *
     * @param PdfInvoice $subject
     * @param \Zend_Pdf_Page $page
     * @param array $pickupPointData
     * @return void
     */
    private function addPickupPointToPdf($subject, $page, array $pickupPointData): void
    {
        try {
            // Position pickup point info below shipping address section
            // The shipping address typically ends around Y=650-680
            // We'll place it at a fixed position to ensure it's in the right spot
            $y = 650;

            // Add some spacing
            $y -= 10;

            // Calculate box height based on content
            $boxHeight = 65;
            if (!empty($pickupPointData['pickup_point_address'])) {
                $addressLines = explode(',', $pickupPointData['pickup_point_address']);
                $boxHeight += (count($addressLines) * 12);
            }

            // Draw background box (light green background like CSS: #F6FBF6)
            $page->setFillColor(new \Zend_Pdf_Color_Html('#F6FBF6'));
            $page->setLineColor(new \Zend_Pdf_Color_Html('#e3e3e3'));
            $page->setLineWidth(0.5);
            $page->drawRectangle(285, $y, 570, $y - $boxHeight);

            // Draw top border
            $page->setLineColor(new \Zend_Pdf_Color_Html('#e3e3e3'));
            $page->setLineWidth(1);
            $page->drawLine(285, $y, 570, $y);

            // Set text color to black
            $page->setFillColor(new \Zend_Pdf_Color_GrayScale(0));

            // Draw header
            $y -= 15;
            $page->setFont(\Zend_Pdf_Font::fontWithName(\Zend_Pdf_Font::FONT_HELVETICA_BOLD), 11);
            $page->drawText(__('Pickup Point Information'), 295, $y, 'UTF-8');

            // Add spacing after header
            $y -= 18;

            // Draw pickup point name (bold)
            if (!empty($pickupPointData['pickup_point_name'])) {
                $page->setFont(\Zend_Pdf_Font::fontWithName(\Zend_Pdf_Font::FONT_HELVETICA_BOLD), 10);
                $page->drawText($pickupPointData['pickup_point_name'], 295, $y, 'UTF-8');
                $y -= 14;
            }

            // Draw pickup point address (regular font)
            if (!empty($pickupPointData['pickup_point_address'])) {
                $page->setFont(\Zend_Pdf_Font::fontWithName(\Zend_Pdf_Font::FONT_HELVETICA), 9);
                $addressLines = explode(',', $pickupPointData['pickup_point_address']);
                foreach ($addressLines as $line) {
                    $line = trim($line);
                    if ($line) {
                        $page->drawText($line, 295, $y, 'UTF-8');
                        $y -= 12;
                    }
                }
            }

            // Draw carrier name
            if (!empty($pickupPointData['pickup_point_carrier'])) {
                $carrierText = strtoupper($pickupPointData['pickup_point_carrier']);
                $page->setFillColor(new \Zend_Pdf_Color_Html('#333333'));
                $page->setFont(\Zend_Pdf_Font::fontWithName(\Zend_Pdf_Font::FONT_HELVETICA_BOLD), 9);
                $page->drawText($carrierText, 520, $y + 20, 'UTF-8');
            }

            // Update Y position in subject
            $subject->y = $y - 15;

            $this->logger->info('Innosend Pickup Points: Successfully added pickup point to PDF page');

        } catch (\Exception $e) {
            $this->logger->error('Innosend Pickup Points: Failed to add pickup point to PDF', [
                'error' => $e->getMessage(),
                'trace' => $e->getTraceAsString(),
            ]);
        }
    }
}

